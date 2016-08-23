/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Matej Šircelj
*/
var async = require("async");
var url = require('url');
var path = require('path');

var AWS = require('aws-sdk');

function AWSUploadPlugin(options) {
	this.options = options || {};

	AWS.config.update(options.aws_config);

	this.lambda = new AWS.Lambda({apiVersion: '2015-03-31'});

	try {
		var zip = require("node-zip");
	} catch(err) {
		throw new Error("node-zip not found");
	}
	this.algorithm = function (content, filename, fn) {
		var zip = new JSZip();
		zip.file(filename, content);
		var data = zip.generate({type:"uint8array", compression: 'deflate'});

		fn(null, data);
	};
}
module.exports = AWSUploadPlugin;

AWSUploadPlugin.prototype.apply = function(compiler) {
	compiler.plugin("this-compilation", function(compilation) {
		compilation.plugin("optimize-assets", function(assets, callback) {
			async.forEach(Object.keys(assets), function(file, callback) {
				var asset = assets[file];
				var content = asset.source();
				
				if(!Buffer.isBuffer(content)){
					content = new Buffer(content, "utf-8");
				}
				
				var parse = url.parse(file);
				var sub = {
					file: path.basename(parse.pathname),
					path: parse.pathname,
					query: parse.query || ""
				};

				this.algorithm(content, sub.file, function(err, result) {
					if(err) return callback(err);

					var params = {
					  FunctionName: this.options.lambda_name, /* required */
					};
					var me = this;
					this.lambda.getFunction(params, function(err, data) {
						if (err) { // NO FUNCTION FOUND - CREATE NEW
					  		console.log("NO FUNCTION FOUND - CREATING NEW")
						  	var params = {
							  Code: {
							    ZipFile: result
							  },
							  FunctionName: me.options.lambda_name,
							  Handler: me.options.lambda_handler,
							  Role: me.options.lambda_role,
							  Runtime: me.options.lambda_runtime,
							  //Description: 'STRING_VALUE',
							  MemorySize: me.options.lambda_memory_size || 128,
							  Publish: me.options.lambda_publish || true,
							  Timeout: me.options.lambda_timeout || 3
							};

							me.lambda.createFunction(params, function(err, data) {
							  if (err) console.log(err, err.stack); // an error occurred
							  else     console.log(data);           // successful response
							});
						}else{ // 
						  	console.log("FUNCTION FOUND - UPDATING CODE");
						  	var params = {
								FunctionName: me.options.lambda_name, /* required */
								Publish: me.options.lambda_publish || true,
								ZipFile: result
							};
							me.lambda.updateFunctionCode(params, function(err, data) {
							  if (err) console.log(err, err.stack); // an error occurred
							  else     console.log(data);           // successful response
							});
						}     
					});

					callback();
				}.bind(this));

			}.bind(this), callback);
		}.bind(this));
	}.bind(this));
};
