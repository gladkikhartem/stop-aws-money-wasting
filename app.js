//var AWS = require('aws-sdk/dist/aws-sdk-react-native');
var AWS = require(['aws-sdk']);
document.getElementById("AWS_ACCESS_KEY_ID").value = localStorage.getItem('AWS_ACCESS_KEY_ID');
document.getElementById("AWS_SECRET_ACCESS_KEY").value = localStorage.getItem('AWS_SECRET_ACCESS_KEY');
document.getElementById("AWS_SECRET_ACCESS_TOKEN").value = localStorage.getItem('AWS_SECRET_ACCESS_TOKEN');
var log = document.getElementById("log");
$('#prog-bar').attr('aria-valuenow',0);
$('#prog-bar').css("width", "0%");


var awsRegions = [
"us-east-2",
"us-east-1",
"us-west-1",
"us-west-2",
"af-south-1",
"ap-east-1",
"ap-south-1",
"ap-northeast-3",
"ap-northeast-2",
"ap-southeast-1",
"ap-southeast-2",
"ap-northeast-1",
"ca-central-1",
"cn-north-1",
"cn-northwest-1",
"eu-central-1",
"eu-west-1",
"eu-west-2",
"eu-south-1",
"eu-west-3",
"eu-north-1",
"me-south-1",
"sa-east-1"
]

var createReport = function() {
    localStorage.setItem('AWS_ACCESS_KEY_ID', document.getElementById("AWS_ACCESS_KEY_ID").value);
    localStorage.setItem('AWS_SECRET_ACCESS_KEY', document.getElementById("AWS_SECRET_ACCESS_KEY").value);
    localStorage.setItem('AWS_SECRET_ACCESS_TOKEN', document.getElementById("AWS_SECRET_ACCESS_TOKEN").value);

    f = async function() {
        sum  = 0.0
        len = awsRegions.length
        for(var i in awsRegions) {
            $('#prog-bar').attr('aria-valuenow', ((Number(i) + 1)/23)*100);
            $('#prog-bar').css("width", ((Number(i) + 1)/23)*100 + "%");
            var r = awsRegions[i]
            try {
                AWS.config = new AWS.Config({
                    accessKeyId: document.getElementById("AWS_ACCESS_KEY_ID").value,
                    secretAccessKey: document.getElementById("AWS_SECRET_ACCESS_KEY").value,
                    sessionToken: document.getElementById("AWS_SECRET_ACCESS_TOKEN").value,
                    region: r
                });
                log.innerHTML += "Analyzing region " + r + "...</br>";
                sum += await volumesReport(r)
                sum += await rdsReport(r)
            } catch(ex) {
                log.innerHTML += ex;
            }
        }
        $(".table").css("display","block")
        $('.progress').css("display","none")
        sum *= 12 // month to year. Annual savings look bigger)))
        document.getElementById("result").innerHTML += 'You have <b style="color:red;">' + (sum.toFixed(0)) + '$</b> wasted on AWS every year';
    }
    f()
    return false
}

function addTable(region, name, cost, description) {
    $("#table-body")
    markup = "<tr><td>" + region + "</td><td>" + name + "</td><td>" + cost + "</td><td>" + description + "</td></tr>"; 
    $("#table-body").append(markup); 
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

var volumesReport = async function(reg) {
    log.innerHTML += "Analyzing instances...</br>";
    log.scrollTop = log.scrollHeight;
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
    log.scrollTop = log.scrollHeight;
    var volumes = {}
    var res =  await ec2.describeVolumes().promise();
    console.log(res)
    for (var v of res.Volumes) {
        if (v.State == "available") {
            sum += volumeCost(v);
            addTable(reg,v.VolumeId, volumeCost(v), "volume is unused");
        } else {
            for (var a of v.Attachments) {
                if (instances[a.InstanceId].State.Name == "stopped") {
                    sum += volumeCost(v);
                    addTable(reg,v.VolumeId, volumeCost(v), "volume is attached to a stopped instance");
                }
            }
        }
    }
    console.log(sum)
    return sum
}


var rdsReport = async function(reg) {
    var sum = 0.0
    var rds = new AWS.RDS({apiVersion: '2014-10-31'});

    log.innerHTML += "Analyzing RDS...</br>";
    log.scrollTop = log.scrollHeight;
    var res = await rds.describeDBInstances().promise();
    console.log(res)
    var dbs = {}
    for (var v of res.DBInstances) {
        dbs[v.DBInstanceIdentifier] = v
    }

    log.innerHTML += "Analyzing snapshots...</br>";
    log.scrollTop = log.scrollHeight;
    var res = await rds.describeDBSnapshots().promise();
    console.log(res)
    console.log(dbs)

    for (var v of res.DBSnapshots) {
        if (!(v.DBInstanceIdentifier in dbs)) {
            sum += v.AllocatedStorage * 0.05 * 0.3  // 0.3 is a optimistic 1:3 DB compression ratio for RDS snapshot
            addTable(reg,v.DBSnapshotIdentifier, sum, "RDS snapshot does not belong to any database");
        }
    }

    return sum
}

//TOOD:  Elastic IPs not attached to running EC2 instances 