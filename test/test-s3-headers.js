var S3 = require('../lib/s3').S3;

var nodeunit = require('caolan-nodeunit/lib/nodeunit');

// these arn't real keys...
var AWSAccessKeyId = '0PN5J17HBGZHT7JJ3X82';
var AWSSecretAccessKey = 'uV3F3YluFJax1cknvbcGwgjvx4QpvB+leU8dUj2o';


var testData = [
	{
		resource : '/johnsmith/photos/puppy.jpg',
		method : 'GET',
		header : {
			'Host': 'johnsmith.s3.amazonaws.com',
			'Date': 'Tue, 27 Mar 2007 19:36:42 +0000'
		},
		expectedCanonicalHeaders : '',
		expectedStringToSign: 'GET\n\n\nTue, 27 Mar 2007 19:36:42 +0000\n/johnsmith/photos/puppy.jpg',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:xXjDGYUmKxnwqr5KXNPGldn5LbA=',
		bucket : 'johnsmith'
	},
	{
		resource : '/johnsmith/photos/puppy.jpg',
		method : 'PUT',
		header : {
			'Content-Type': 'image/jpeg',
			'Content-Length': '94328',
			'Host': 'johnsmith.s3.amazonaws.com',
			'Date': 'Tue, 27 Mar 2007 21:15:45 +0000'
		},
		expectedCanonicalHeaders : '',
		expectedStringToSign : 'PUT\n\nimage/jpeg\nTue, 27 Mar 2007 21:15:45 +0000\n/johnsmith/photos/puppy.jpg',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:hcicpDDvL9SsO6AkvxqmIWkmOuQ=',
		bucket : 'johnsmith'
	},
	
	// test with no content type
	{
		resource : '/johnsmith/',
		method : 'GET',
		header : {
			'User-Agent': 'Mozilla/5.0',
			'Host': 'johnsmith.s3.amazonaws.com',
			'Date': 'Tue, 27 Mar 2007 19:42:41 +0000'
		},
		expectedCanonicalHeaders : '',
		expectedStringToSign : 'GET\n\n\nTue, 27 Mar 2007 19:42:41 +0000\n/johnsmith/',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:jsRt/rhG+Vtp88HrYL706QhE4w4=',
		bucket : 'johnsmith'
	},
	
	// test removing the date if x-amx-date is present, also path style of bucket
	// instead of having it in the host
	{
		resource : '/johnsmith/photos/puppy.jpg',
		method : 'DELETE',
		header : {
			'User-Agent': 'dotnet',
			'Host': 's3.amazonaws.com',
			'Date': 'Tue, 27 Mar 2007 21:20:27 +0000',
			'x-amz-date': 'Tue, 27 Mar 2007 21:20:26 +0000'
		},
		expectedCanonicalHeaders : 'x-amz-date:Tue, 27 Mar 2007 21:20:26 +0000\n',
		expectedStringToSign : 'DELETE\n\n\n\nx-amz-date:Tue, 27 Mar 2007 21:20:26 +0000\n/johnsmith/photos/puppy.jpg',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:k3nL7gH3+PadhTEVn5Ip83xlYzk=',
		bucket : ''
	},
	
	// note the use of multiple authors -- test header used more than once & with md5
	{
		resource : '/static.johnsmith.net/db-backup.dat.gz',
		method : 'PUT',
		header : {
			'User-Agent': 'curl/7.15.5',
			'Host': 'static.johnsmith.net:8080',
			'Date': 'Tue, 27 Mar 2007 21:06:08 +0000',
			'x-amz-acl': 'public-read',
			'Content-Type': 'application/x-download',
			'Content-MD5': '4gJE4saaMU4BqNR0kLY+lw==',
			'X-Amz-Meta-ReviewedBy': ['joe@johnsmith.net','jane@johnsmith.net'],
			'X-Amz-Meta-FileChecksum': '0x02661779',
			'X-Amz-Meta-ChecksumAlgorithm': 'crc32',
			'Content-Disposition': 'attachment; filename=database.dat',
			'Content-Encoding': 'gzip',
			'Content-Length': '5913339'
		},
		expectedCanonicalHeaders : 'x-amz-acl:public-read\nx-amz-meta-checksumalgorithm:crc32\nx-amz-meta-filechecksum:0x02661779\nx-amz-meta-reviewedby:joe@johnsmith.net,jane@johnsmith.net\n',
		expectedStringToSign : 'PUT\n4gJE4saaMU4BqNR0kLY+lw==\napplication/x-download\nTue, 27 Mar 2007 21:06:08 +0000\nx-amz-acl:public-read\nx-amz-meta-checksumalgorithm:crc32\nx-amz-meta-filechecksum:0x02661779\nx-amz-meta-reviewedby:joe@johnsmith.net,jane@johnsmith.net\n/static.johnsmith.net/db-backup.dat.gz',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:C0FlOtU8Ylb9KDTpZqYkZPX91iI=',
		bucket : 'static.johnsmith.net'
	},
	
	//same as above but testing without a port
	{
		resource : '/static.johnsmith.net/db-backup.dat.gz',
		method : 'PUT',
		header : {
			'User-Agent': 'curl/7.15.5',
			'Host': 'static.johnsmith.net',
			'Date': 'Tue, 27 Mar 2007 21:06:08 +0000',
			'x-amz-acl': 'public-read',
			'Content-Type': 'application/x-download',
			'Content-MD5': '4gJE4saaMU4BqNR0kLY+lw==',
			'X-Amz-Meta-ReviewedBy': ['joe@johnsmith.net','jane@johnsmith.net'],
			'X-Amz-Meta-FileChecksum': '0x02661779',
			'X-Amz-Meta-ChecksumAlgorithm': 'crc32',
			'Content-Disposition': 'attachment; filename=database.dat',
			'Content-Encoding': 'gzip',
			'Content-Length': '5913339'
		},
		expectedCanonicalHeaders : 'x-amz-acl:public-read\nx-amz-meta-checksumalgorithm:crc32\nx-amz-meta-filechecksum:0x02661779\nx-amz-meta-reviewedby:joe@johnsmith.net,jane@johnsmith.net\n',
		expectedStringToSign : 'PUT\n4gJE4saaMU4BqNR0kLY+lw==\napplication/x-download\nTue, 27 Mar 2007 21:06:08 +0000\nx-amz-acl:public-read\nx-amz-meta-checksumalgorithm:crc32\nx-amz-meta-filechecksum:0x02661779\nx-amz-meta-reviewedby:joe@johnsmith.net,jane@johnsmith.net\n/static.johnsmith.net/db-backup.dat.gz',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:C0FlOtU8Ylb9KDTpZqYkZPX91iI=',
		bucket : 'static.johnsmith.net'
	},
	
	// test unicode
	{
		resource : '/dictionary/fran%C3%A7ais/pr%c3%a9f%c3%a8re',
		method : 'GET',
		header : {
			'Host': 's3.amazonaws.com',
			'Date': 'Wed, 28 Mar 2007 01:49:49 +0000'
		},
		expectedCanonicalHeaders : '',
		expectedStringToSign : 'GET\n\n\nWed, 28 Mar 2007 01:49:49 +0000\n/dictionary/fran%C3%A7ais/pr%c3%a9f%c3%a8re',
		authorizationDigest: 'AWS 0PN5J17HBGZHT7JJ3X82:dxhSBHoI6eVSPcXJqEghlUzZMnY=',
		bucket : ''
	},
];



//test cananicalized headers
exports.testGetCanonicalizedAmzHeaders = function(test){
	executeTestInLoop(function(test,i){
		var result = s3._getCanonicalizedAmzHeaders(testData[i].header);
		test.same(result, testData[i].expectedCanonicalHeaders);
	}, test);
};

//test the string we sign
exports.testGetStringToSign = function(test){
	executeTestInLoop(function(test,i){
		var stringToSign = s3._getStringToSign(testData[i].header, testData[i].method, testData[i].expectedCanonicalHeaders, testData[i].resource);
		test.same(stringToSign, testData[i].expectedStringToSign);
	}, test);
};

//test the signin of strings
exports.testGetSignature = function(test){
	executeTestInLoop(function(test,i){
		var digest = s3._getSignature(AWSSecretAccessKey, testData[i].expectedStringToSign);
		test.same('AWS ' + AWSAccessKeyId + ":" + digest, testData[i].authorizationDigest);
	}, test);
};

exports.testGetBucketFromHost = function(test){
	
	executeTestInLoop(function(test,i){
			
			this.s3._getBucketName(testData[i].header['Host'], function(bucket){
				test.same(bucket, testData[i].bucket);
			});
			
		}, test);
};

var executeTestInLoop = function(testToRun, test){
	this.s3 = new S3(AWSSecretAccessKey, AWSAccessKeyId);
	
	this.s3.on('error', function(err){
		test.ok(false, err);
	});
			
	for (var i = 0; i < testData.length; i++) {
		testToRun(test, i);		
	}
	test.done();
} 



