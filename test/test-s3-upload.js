
//note these must be set to pass all tests!
var RealAWSAccessKeyId = '';
var RealAWSSecretAccessKey = '';
var RealHosts = '[bucket-name].s3.amazonaws.com'

// note: these aren't real keys
var AWSAccessKeyId = '0PN5J17HBGZHT7JJ3X82';
var AWSSecretAccessKey = 'uV3F3YluFJax1cknvbcGwgjvx4QpvB+leU8dUj2o';

var S3 = require('../lib/s3').S3;
var nodeunit = require('caolan-nodeunit/lib/nodeunit');

var sys = require('sys'),
    spawn = require('child_process').spawn,
	fs = require('fs');

	
	
exports.testGetMD5OfMessage = function(test){
	var s3 = new S3(AWSSecretAccessKey, AWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	
	fs.stat('./homersimpson.png', function(err, stats){
		s3._getMD5OfMessage(s3, './homersimpson.png', stats.size, function(hash){
			test.same(hash, '56ukgupzsbLvEqqXO5m2QQ==');
			test.done();
		});
		
		s3.on('hashUpdate', function(percent){
			console.log('hashed percent:' + percent + '%');
			test.ok(true);
		});
	});
};


exports.testBadFileName = function(test){
	var s3 = new S3(AWSSecretAccessKey, AWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	test.expect(1);
	
	s3.on('error', function(err){
		test.ok(true);
		test.done();	
	});
	
	s3.uploadFileToBucket('photos.s3.amazonaws.com', './test2.js');
};

exports.testNoAccessFileName = function(test){
	var s3 = new S3(AWSSecretAccessKey, AWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	test.expect(1);
	var createFile = spawn('touch', ['', 'noaccess.js']);
	
	createFile.on('exit', function(code){
		if (code !== 1){
			console.log('unable to run test because file couldnt be created')
			test.ok(false);
			test.done();
			return;
		}
		
		var makeNoAccess = spawn('chmod', ['gou=', 'noaccess.js']);
		makeNoAccess.on('exit', function(code){
			if (code !== 0){
				console.log('unable to run test because file permissions couldn\'t be chmod\'ed. exit code : ' + code);
				test.ok(false);
				test.done();
				return;
			}
			
			s3.on('error', function(error){
				test.ok(true);
				test.done();
			});
			
			s3.uploadFileToBucket('photos.s3.amazonaws.com', './noaccess.js');
		});
	});
};

exports.testUploadFileToBucket = function(test){
	var s3 = new S3(AWSSecretAccessKey, AWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	test.expect(28);
	
	s3.on('error', function(error){
		console.log(error);
		// this shouldn't happen...
		test.ok(false);
	});
	
	//override the called functions
	s3._getFileName = function(filePath){
		test.same(filePath, './test.js');
		test.ok(true);
		return 'test.js';
	};
	
	s3._getMimeType = function(filePath){
		test.same(filePath, './test.js');
		test.ok(true);
		return 'javascript';
	};
	
	// tested in test-s3-headers.js
	s3._getBucketName = function(host, actionToCall){
		test.ok(true);
		test.same(host, 'photos.s3.amazonaws.com');
		actionToCall('photos');
	};
	
	s3._getFileSize = function(stats){
		test.ok(true);
		test.ok(stats !== undefined);
		return 10;
	};
	
	s3._getPutHeaders = function(host, mimeType, fileSize){
		test.ok(true);
		test.same(host,'photos.s3.amazonaws.com');
		test.same(mimeType, 'javascript');
		test.same(fileSize, 10);
		
		return {'sweet-header' : true};
	}; 
	
	s3._getCanonicalizedAmzHeaders = function(headers){
		test.ok(true);
		test.ok(headers['sweet-header'] === true);
		return 'these headers';
	}
	
	s3._getStringToSign = function (headers, method, canonicalizedAmzHeaders, resource){
		test.ok(true);
		test.ok(headers['sweet-header'] != null);
		test.same('PUT', method);
		test.same(canonicalizedAmzHeaders, 'these headers');
		test.same(resource, '/photos/test.js');
		return 'string to sign';
	}
	
	s3._getSignature = function(secretKey, stringToSign){
		test.ok(true);
		test.same(secretKey, AWSSecretAccessKey);
		test.same(stringToSign, 'string to sign');
		return 'signiture';
	}
	
	s3._getAuthorization = function(key, signiture){
		test.ok(true);
		test.same(key, AWSAccessKeyId);
		test.same(signiture, 'signiture');
		return 'authorization';
	}
	
	s3._sendPutRequest = function(headers, fileNameWithPath){
		test.ok(true);
		test.ok(headers['sweet-header'] === true);
		test.ok(headers['Authorization'] === 'authorization');
		test.done();
	};
	
	s3.uploadFileToBucket('photos.s3.amazonaws.com', './test.js');
};

exports.testSendPutRequest = function(test){
	if(RealAWSAccessKeyId === '')
	{
		test.same('SET WORKING KEYS TO TEST ACTUAL UPLOAD/DOWNLOAD', false);
		test.done();
		return;
	}
	
	var s3 = new S3(RealAWSSecretAccessKey, RealAWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	
	s3.uploadFileToBucket(RealHosts, './homersimpson.png');
	
	s3.on('complete', function(){
		test.ok(true);
		
		//now get the file
		var s3 = new S3(RealAWSSecretAccessKey, RealAWSAccessKeyId, {storageType : 'REDUCED_REDUNDANCY'});
	
		s3.getFileFromBucket(RealHosts, 'homersimpson.png', 'homersimpson2.png');
		
		s3.on('complete', function(){
			test.ok(true);
			test.done();
		});
		
		s3.on('progress', function(percentDone){
			test.ok(true);
			console.log('percent downloaded: ' + percentDone + '%');
		});	
		
		s3.on('error', function(ex){
			test.ok(false);
			console.log('error ' + ex);
			test.done();
		});
		
	});
	
	s3.on('error', function(exception){
		test.ok(false);
		console.log('error while running test: ' + exception);
	});
	
	s3.on('progress', function(percentDone){
		test.ok(true);
		console.log('percent done: ' + percentDone + '%');
	});	
	
	s3.on('hashUpdate', function(percent){
			console.log('hashed percent:' + percent + '%');
			test.ok(true);
	});
};
/*
exports.testGetFileFromBucket = function(test){
	
};*/