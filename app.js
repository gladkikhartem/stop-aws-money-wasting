require(['aws-sdk'], function (AWS, CONF) {    
    function init(){
        AWS.config = new AWS.Config({
            access_key_id: "CONF.AWS_ACCESS_KEY_ID",
            secretAccessKey: "CONF.AWS_SECRET_ACCESS_KEY",
            region: "us-east-1"
        });
        var s3 = new AWS.S3({apiVersion: '2006-03-01'});

    }
});          