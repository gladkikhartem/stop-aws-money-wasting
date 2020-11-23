//var AWS = require('aws-sdk/dist/aws-sdk-react-native');
var AWS = require(['aws-sdk']);
document.getElementById("AWS_ACCESS_KEY_ID").value = localStorage.getItem('AWS_ACCESS_KEY_ID');
document.getElementById("AWS_SECRET_ACCESS_KEY").value = localStorage.getItem('AWS_SECRET_ACCESS_KEY');
document.getElementById("AWS_SECRET_ACCESS_TOKEN").value = localStorage.getItem('AWS_SECRET_ACCESS_TOKEN');
var log = document.getElementById("log");

var createReport = function() {
    AWS.config = new AWS.Config({
        accessKeyId: document.getElementById("AWS_ACCESS_KEY_ID").value,
        secretAccessKey: document.getElementById("AWS_SECRET_ACCESS_KEY").value,
        sessionToken: document.getElementById("AWS_SECRET_ACCESS_TOKEN").value,
        region: "us-east-1"
    });
    localStorage.setItem('AWS_ACCESS_KEY_ID', document.getElementById("AWS_ACCESS_KEY_ID").value);
    localStorage.setItem('AWS_SECRET_ACCESS_KEY', document.getElementById("AWS_SECRET_ACCESS_KEY").value);
    localStorage.setItem('AWS_SECRET_ACCESS_TOKEN', document.getElementById("AWS_SECRET_ACCESS_TOKEN").value);

    f = async function() {
        try {
            log.innerHTML = "";
            console.log("Start")
            sum  = 0.0
            sum += await volumesReport()
            sum += await rdsReport()
            sum *= 12
            log.innerHTML += 'You have <b style="color:red;">' + (sum.toFixed(0)) + '$</b> wasted on AWS every year. See console log for more details.';
            console.log("Finished")
        } catch(ex) {
            log.innerHTML += ex;
        }
    }
    f()
    return false
}

function volumeCost(v) {
    if (v.VolumeType == "gp2") {
        return v.Size * 0.1
    }
    if (v.VolumeType == "io1" || v.VolumeType == "io2") {
        return v.Size * 0.125 + v.Iops*0.065
    }
    if (v.VolumeType == "st1") {
        return v.Size * 0.045
    }
    if (v.VolumeType == "sc1") {
        return v.Size * 0.015
    }
    return v.Size * 0.05
}

var volumesReport = async function() {
    log.innerHTML += "Analyzing instances...</br>";
    var sum = 0.0;
    var ec2 = new AWS.EC2();
    var res =  await ec2.describeInstances().promise();
    console.log(res)
    var instances = {}
    for (var r of res.Reservations) {
        for (var v of r.Instances) {
            instances[v.InstanceId] = v
        }
    }

    log.innerHTML += "Analyzing volumes...</br>";
    var volumes = {}
    var res =  await ec2.describeVolumes().promise();
    console.log(res)
    for (var v of res.Volumes) {
        if (v.State == "available") {
            sum += volumeCost(v);
            console.log("volume is unused", v.VolumeId, volumeCost(v));
        } else {
            for (var a of v.Attachments) {
                if (instances[a.InstanceId].State.Name == "stopped") {
                    sum += volumeCost(v);
                    console.log("volume is attached to a stopped instance", v.VolumeId, volumeCost(v));
                }
            }
        }
    }
    console.log(sum)
    return sum
}


var rdsReport = async function() {
    var sum = 0.0
    var rds = new AWS.RDS({apiVersion: '2014-10-31'});

    log.innerHTML += "Analyzing RDS...</br>";
    var res = await rds.describeDBInstances().promise();
    console.log(res)
    var dbs = {}
    for (var v of res.DBInstances) {
        dbs[v.DBInstanceIdentifier] = v
    }

    log.innerHTML += "Analyzing Snapshots...</br>";
    var res = await rds.describeDBSnapshots().promise();
    console.log(res)
    console.log(dbs)

    for (var v of res.DBSnapshots) {
        if (!(v.DBInstanceIdentifier in dbs)) {
            sum += v.AllocatedStorage * 0.05 * 0.3  // 0.3 is a optimistic 1:3 DB compression ratio for RDS snapshot
            console.log("RDS snapshot does not belong to any database", v.DBSnapshotIdentifier, v.AllocatedStorage);
        }
    }

    return sum
}
