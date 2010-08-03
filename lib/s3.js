/*
 * 	Dallin Dyer 
 * 
 * 	A simple S3 library written because the other implementation doesn't meet needs and is outdated.
 * 
 *  What this library is good for:
 *
 * 	** Can send files any size (although S3 is currently limited at 5 gigs)
 * 	** Streams files from disk to socket -- minimal memory footprint and very efficient 
 * 	** Uses sockets to support 100 Continue (especially usefull for large files)
 * 		- the body is only sent after amazon approves the signed header
 * 	** Supports amazons new REDUCED_REDUNDANCY storage (cheaper but less reliable)
 * 	** Supports specifying acl
 * 	** Creates hash of file to validate contents  
 * 
 * 
 * 
 * 
 * Events emited from this S3 library:
 * 	
 * 	PUT : 
 * 		progress(percentsent){}, complete(){}, error(exception){}
 * 	DELETE :
 * 		complete(){}, error(exception){}
 * 	GET : 
 * 		complete(resultCode){}, error(exception){}
 * 
 * storage types:
 * 		(http://aws.amazon.com/about-aws/whats-new/2010/05/19/announcing-amazon-s3-reduced-redundancy-storage/)
 * 	
 * 	STANDARD 
 *  REDUCED_REDUNDANCY (cheaper, but less reliable)
 *  
 * Acl types:
 * 		(http://docs.amazonwebservices.com/AmazonS3/latest/dev/index.html?RESTAccessPolicy.html)
 * 	private | public-read | public-read-write | authenticated-read | bucket-owner-read | bucket-owner-full-control
 * 
 */

var sys = require('sys'),		
	http = require('http'),		 
	crypto = require('crypto'),  
	fs = require('fs'),
	EventEmitter = require('events').EventEmitter,
	net = require('net'),
	dns = require('dns');

var mime = require('node-mime/mime');

process.on('uncaughtException', function (err) {
  console.log('warning! uncaught exception: ' + err);
});

/*
 * Amazon's restful documentation = 
 * 
 * http://docs.amazonwebservices.com/AmazonS3/latest/index.html?RESTObjectPUT.html
 * http://docs.amazonwebservices.com/AmazonS3/index.html?RESTAuthentication.html
 * http://docs.amazonwebservices.com/AmazonS3/latest/index.html?RESTCommonRequestHeaders.html
 */

 
/* 
 * Amazon S3 signing algorithm - 
 * 
 * Authorization = "AWS" + " " + AWSAccessKeyId + ":" + Signature;
 * 
 * Signature = Base64( HMAC-SHA1( UTF-8-Encoding-Of( YourSecretAccessKeyID, StringToSign ) ) );
 * 
 * StringToSign = HTTP-Verb + "\n" +
 * 		Content-MD5 + "\n" +
 * 		Content-Type + "\n" +
 * 		Date + "\n" +
 * 		CanonicalizedAmzHeaders +
 * 		CanonicalizedResource;
 * 
 * 	CanonicalizedResource = [ "/" + Bucket ] +
 * 		<HTTP-Request-URI, from the protocol name up to the query string> +
 * 		[ sub-resource, if present. For example "?acl", "?location", "?logging", or "?torrent"];
 * 
 * 	CanonicalizedAmzHeaders = <described below>
 * 
 */


/*
 */
var S3 = function(awsSecretKey, awsAccessKey, options){
	this._awsSecretKey = awsSecretKey;
	this._awsAccessKey = awsAccessKey;
	
	options = options || function(){};
	
	this._storageType = options.storageType || 'STANDARD';	// standard storage type
	this._acl = options.acl || 'private';					// set status to private on upload
	this._checkMD5 = options.checkMD5 || true;  			// check the md5 on upload
	
};

S3.prototype = new EventEmitter;
S3.prototype.constructor = S3;


		
/* 
 * uploades the file (with path) to the bucket found in the host
 * 
 * the host should either be: 
 * 	bucketname.s3.amazonaws.com 
 * 		or 
 * 	the the whole host:port (no s3.amazonaws.com in the name)
 * 
 */
S3.prototype.uploadFileToBucket = function(host, fileNameWithPath){
	try {
		var awsSecretKey = this._awsSecretKey;
		var awsAccessKey = this._awsAccessKey;
		
		// capture instance in closure so we don't have to worry about 'this'
		var s3 = this;
		
		// check if file is valid... otherwise bail out.
		fs.stat(fileNameWithPath, function(err, stats){
			if (err) {
				s3.emit('error', err);
				return;
			}
			
			var fileSize = s3._getFileSize(stats);
			var fileName = s3._getFileName(fileNameWithPath);
			var mimeType = s3._getMimeType(fileNameWithPath);
			
			s3._getBucketName(host, function(res){
				var bucketName = res;
	
				var resource = '/' + bucketName + '/' + fileName;
				var headers = s3._getPutHeaders(host, mimeType, fileSize); 
				
				// the md5 is async so we continue when complete
				var afterMD5Callback = function(hash){
					if(hash){
						headers['Content-MD5'] = hash;
					}
					
					// add the amazon authorization header 
					s3._addAuthorizationHeader(headers, 'PUT', resource, awsSecretKey, awsAccessKey);
					
					// send the put request
					s3._sendPutRequest(headers, fileNameWithPath);
				};
				
				
				// add md5 if set in options
				if(s3._checkMD5 === true){
					s3._getMD5OfMessage(s3, fileNameWithPath, fileSize, afterMD5Callback);
				}
				else{
					afterMD5Callback();
				}
				
			});
		});
		
	}catch(err){
		this.emit('error', err);
	}
};

S3.prototype.getFileFromBucket = function(host, fileName, destinationFile){
	try {
		var awsSecretKey = this._awsSecretKey;
		var awsAccessKey = this._awsAccessKey;
		var s3 = this;
		
		s3._getBucketName(host, function(res){
				var bucketName = res;
	
				var resource = '/' + bucketName + '/' + fileName;
				var headers = s3._getGetHeaders(host); 
				
				
				// add the amazon authorization header 
				s3._addAuthorizationHeader(headers, 'GET', resource, awsSecretKey, awsAccessKey);
				
				// send the get request
				s3._sendGetRequest(headers, fileName, destinationFile);
		});
	
	}catch(err){
		this.emit('error', err);
	}
};




/* 
 * Opens the file and streams it over to amazon after getting the 100 continue.
 * 
 * because the file is streamed from the disk to the socket, memery consumption is minimal and efficient
 * 
 * uses the net.stream instead of http libraries so we can use 100 continue (which isn't supported in the
 * http libraris of node.js as of writting this.
 * 
 * 
 */
S3.prototype._sendPutRequest = function(headers, fileNameWithPath){
	
	var s3 = this;
	
	// currently just ipv4
	dns.resolve4(headers.Host,function (err, addresses) {
		
		if (err) {
	  		s3.emit('error', err);
			return;
		};
		
		// create a stream connection with the host
	 	stream = net.createConnection(80, host=addresses[0]);
		
		// create a stream from the file we will send
		var fileStream = s3._createReadFileStream(fileNameWithPath);
		
		// don't pull anything from the file until we have a connection with the remote server	
		fileStream.pause();
		
		var progressBar = s3._progressBar(s3, 'progress', headers['Content-Length']);
		
		fileStream.on('data', function(data){
				// if stream returns false, then we need to pause reading from file and wait for the content to 
				// sent across to the remote server
				if(!stream.write(data)){
					fileStream.pause();
				}
			// update progress and emit progress 
			progressBar(data.length);
		});
			
		fileStream.on('end', function(){ stream.end(); });
			
		fileStream.on('error', function(ex){
			// end both streams on error...
			fileStream.destroy();
			stream.destroy();
			s3.emit('error', ex);
		});
		
		stream.on('drain', function(){ fileStream.resume(); });
		stream.on('close', function(hadError){ s3.emit('complete');	});
		stream.on('end', function(){ 
			stream.end(); 
		});
		stream.on('timeout', function(){ });
		
		// make the connection, send headers
		stream.on('connect', function(streamConnection){
			var headerString = "PUT " + '/' + s3._getFileName(fileNameWithPath) + " HTTP/1.1" + "\n"
			for(var header in headers)
			{
				if (headers[header] !== '') {
					headerString += header + ': ' + headers[header] + "\r\n";
				}
			}
			stream.write(headerString += "\r\n");
		});
		
		stream.on('error', function(err){
			fileStream.destroy();
			stream.destroy();
			s3.emit('error', err);
		});
		
		stream.on('data', function (data) { 
			var continueHeader = /100\s+continue/i;
			var errorHeader = /400\s+Bad\s+Request/i;
								
			//if 100 continue then stream the data to the server
			if(continueHeader.test(data)){
				fileStream.resume();
			}
			
			if(errorHeader.test(data)){
				s3.emit('error', data);
				fileStream.end();
				stream.end();
				return;
			}
			
			console.log(data);
			//todo: check for other errors...
		});
	});
};


/* 
 * Opens a file stream and streams the contents from amazon into the file
 * 
 * 
 */
S3.prototype._sendGetRequest = function(headers, fileName, destination){
	
	var s3 = this;
		
	var amazon = http.createClient(80, headers.Host);
	var fileStream = s3._createWriteFileStream(destination);
	if(!fileStream.writeable){
		s3.emit('error', 'none writable stream');
		return;
	}
	
	var request = amazon.request('GET', '/' + fileName, headers);
	request.end();
	request.on('response', function (response) {
		
		if(response.statusCode == '200'){
			var length = response.headers['content-length'];
			
			//create a progress bar so we know how much has been written
			var progressBar = s3._progressBar(s3, 'progress', length);
			
			response.on('data', function (chunk) {
				if(!fileStream.write(chunk)){
					response.pause();
				}					
				progressBar(chunk.length);
			});
			
			response.on('end', function(){
				fileStream.end();
				s3.emit('complete');
			});
			
			fileStream.on('drain', function(){
				response.resume();
			});
			
			fileStream.on('error', function(ex){
				response.destory();
				fileStream.destroy();
				s3.emit('error', ex);
			});
		}
		else{
			s3.emit('error', response.statusCode + JSON.stringify(response.headers));
		}	
			
	});
};

// broken out so we can control in unit testing.
S3.prototype._getMimeType = function(fileName){
	return mime.lookup(fileName);
};

// broken out so we can control in unit testing.
S3.prototype._getFileSize = function(stats){
	return stats.size;
};

/* gets the bucket name from the host */
S3.prototype._getBucketName = function(host, callback){
	host = host || '';
	
	// if it is on the amazonaws.com then its the first part
	var regex = /(.*)s3.amazonaws.com$/i;
	if(host.match(regex)){
		//remove the '.' if it is there
		callback(RegExp.$1.replace(/\.$/, ''));
		return;
	}
	
	//otherwize its everything until the port
	regex = /(.*):?[0-9]*$/i;
	if(host.match(regex)){
		callback(RegExp.$1.replace(/:[0-9]*$/, ''));
		return;
	}
	
	var error = 'Invalid host';
	//console.log(error);
	s3.emit('error', error);
};

S3.prototype._addAuthorizationHeader = function(headers, method, resource, awsSecretKey, awsAccessKey){
	//amazon canonicalized headres (described in comments below)
	var canonicalizedAmzHeaders = this._getCanonicalizedAmzHeaders(headers);
	
	// get the string to sign (see comments on the method)
	var stringToSign = this._getStringToSign(headers, method, canonicalizedAmzHeaders, resource);
	
	//sign the headers
	var signitureOfHeaders = this._getSignature(awsSecretKey, stringToSign);
	
	// set the amazon authorization header
	headers.Authorization = this._getAuthorization(awsAccessKey, signitureOfHeaders);
};
	
// gets the string to sign based of the headers
S3.prototype._getStringToSign = function(headers, verb, canonicalizedAmzHeaders, canonicalizedResource){
	//create the string to sign using the syntax described in comments above
	
	//make sure we have a date... otherwize create one.
	var date = headers.Date || new Date().toUTCString();
	
	//leave off the date in the string to sign if we have the amx date
	var regex = /x-amz-date/;
	if(regex.test(canonicalizedAmzHeaders))
	{
		date = '';
	}
	
	//make sure we have a content type
	var contentType = headers['Content-Type'] || '';
	
	//try with an md5
	var md5 =  headers['Content-MD5'] || '';
	
	//return the string to sign.
	return stringToSign = 
		verb + "\n" +
		md5 + "\n" + 				// (optional)
		contentType + "\n" +    	// (optional)
		date + "\n" +				// only include if no x-amz-date
		canonicalizedAmzHeaders +	// can be blank
		canonicalizedResource;
	
};

// returns the authorization header
S3.prototype._getAuthorization = function(awsAccessKey, digest){
	return 'AWS ' + awsAccessKey + ":" + digest;
};


// signs the "string to sign" based of the algorithm defined by amazon
S3.prototype._getSignature = function(secretKey, stringToSign){
	var hmac = crypto.createHmac('sha1', secretKey);
	hmac.update(stringToSign);
	return hmac.digest(encoding = 'base64');
};

S3.prototype._getMD5OfMessage = function(instance, file, fileLength, callback){
	var hash = crypto.createHash('md5');
	var fileStream = this._createReadFileStream(file);

	//create a progress bar
	var progress = this._progressBar(this, 'hashUpdate', fileLength);
	
	fileStream.on('data', function(data){
		hash.update(data);
		progress(data.length);	
	});
		
	fileStream.on('end', function(){
		var result = hash.digest(encoding = 'base64');
		console.log(result);
		callback(result);
	});
		
	fileStream.on('error', function(ex){
		instance.emit('error', ex);
	});
};


S3.prototype._createReadFileStream = function(fileName){
	return fs.createReadStream(fileName, { 'flags': 'r'
		, 'encoding': 'ascii'
		, 'mode': 0666
		, 'bufferSize': 4 * 1024
	});
};

S3.prototype._createWriteFileStream = function(fileName){
	return fs.createWriteStream(fileName, { 'flags': 'w'
		, 'encoding': 'ascii'
		, 'mode': 0666
	});
};

S3.prototype._progressBar = function(instance, eventName, total){
	
	var currentTotal = 0;
	var lastPercentage = -1;
	
	return function(update){
		//increase by new amount
		currentTotal += update;
		
		// percentage of what's been sent
		var totalSentPercentage = parseInt((currentTotal / total) * 100);
		
		if(totalSentPercentage != lastPercentage){
			lastPercentage = totalSentPercentage;	
			instance.emit(eventName, lastPercentage);
		}
	};
};
	
/*
 * canonicalizes amazons headers
 * 
 * use an array as the value for a header with more than one value (see unit tests as an example 
 * of multiple authors
 * 
 */ 

S3.prototype._getCanonicalizedAmzHeaders = function(headers){
	
	var canonicalizedHeaders = [];
	var as3Header=/x-amz-/i; 
	
    for (var header in headers){
		// pull out amazon headers
		if(as3Header.test(header)){
			var value = headers[header];
			if(value instanceof Array)
			{
				value = value.join(',');
			}
			canonicalizedHeaders.push(header.toString().toLowerCase() + ':' + value);
		}
	}
	var res = canonicalizedHeaders.sort().join('\n')
	
	//end in new line if any
	if(res){
		res += '\n';
	}
	
	return res;
};


// returns the filename off of the full path to the file (anything after the last '/', or just the name if no '/'
S3.prototype._getFileName = function(fileNameWithPath){
	var indexOfForwardSlash = fileNameWithPath.lastIndexOf('/');
	return (indexOfForwardSlash !== -1)? fileNameWithPath.substr(indexOfForwardSlash + 1) : fileNameWithPath;
};

// returns the headers for a put request
S3.prototype._getPutHeaders = function(host, mimeType, contentLength){
	var instance = this;
	return {
		'Date': new Date().toUTCString(),
		'Content-MD5': '', 					//todo: do md5
		'Host': host, 						// usually bucketName + '.s3.amazonaws.com',
		'Content-Type': mimeType,
		'Content-Length': contentLength,
		'Expect': '100-continue',
		'x-amz-storage-class': instance._storageType,
		'x-amz-acl': instance._acl
	};
};

S3.prototype._getGetHeaders = function(host){
	var instance = this;
	return {
		'Date': new Date().toUTCString(),
		'Host': host
	};
}

// export the s3 library
exports.S3 = S3;












