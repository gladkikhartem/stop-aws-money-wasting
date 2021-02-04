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
                sum += await loadBalancersReport(r)
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
        if (sum > 1000) {
            document.getElementById("result").innerHTML += '. Please consider donating part of saved money to the project :)';
        }
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


var loadBalancersReport = async function(reg) {
    log.innerHTML += "Analyzing load balancers v1...</br>";
    log.scrollTop = log.scrollHeight
    var sum = 0.0
    var start = new Date()
    start.setDate(start.getDate() - 29 )

    var elb = new AWS.ELB()
    var elbv2 = new AWS.ELBv2()
    var cw = new AWS.CloudWatch()

    var res =  await elb.describeLoadBalancers().promise()
    for (var lb of res.LoadBalancerDescriptions) {
        var cwres = await cw.getMetricStatistics({
            StartTime: start,
            EndTime: new Date(),
            MetricName: 'RequestCount',
            Namespace: 'AWS/ELB', 
            Period: 3600*24*30, 
            Dimensions: [
              {
                Name: 'LoadBalancerName', 
                Value: lb.LoadBalancerName,
              },
            ],
            Statistics: ["Sum"],
            Unit: "Count",
          }).promise()
          if (cwres.Datapoints.length == 0 || cwres.Datapoints[0].Sum == 0){
            sum += 16 // $16 per month
            addTable(reg,lb.LoadBalancerName, 16, "classic load balancer did not have any requests in 30 days");
          }
    }

    log.innerHTML += "Analyzing load balancers v2...</br>";
    log.scrollTop = log.scrollHeight

    var resv2 =  await elbv2.describeLoadBalancers().promise();
    console.log(resv2)
    for (var lb of resv2.LoadBalancers) {
        if (lb.Type == "application") {
            var cwname = lb.LoadBalancerArn.substring(lb.LoadBalancerArn.indexOf(":loadbalancer/") + 14)
            var cwres = await cw.getMetricStatistics({
                StartTime: start,
                EndTime: new Date(),
                MetricName: 'RequestCount',
                Namespace: 'AWS/ApplicationELB', 
                Period: 3600*24*30, 
                Dimensions: [
                {
                    Name: 'LoadBalancer', 
                    Value: cwname,
                },
                ],
                Statistics: ["Sum"],
                Unit: "Count",
            }).promise()
            if (cwres.Datapoints.length == 0 || cwres.Datapoints[0].Sum == 0){
                sum += 16 // $16 per month
                addTable(reg,lb.LoadBalancerName, 16, "application load balancer did not have any requests in 30 days");
            }
        }
        if (lb.Type == "network") {
            var cwname = lb.LoadBalancerArn.substring(lb.LoadBalancerArn.indexOf(":loadbalancer/") + 14)
            var cwres = await cw.getMetricStatistics({
                StartTime: start,
                EndTime: new Date(),
                MetricName: 'ActiveFlowCount',
                Namespace: 'AWS/NetworkELB', 
                Period: 3600*24*30, 
                Dimensions: [
                {
                    Name: 'LoadBalancer', 
                    Value: cwname,
                },
                ],
                Statistics: ["Sum"],
                Unit: "Count",
            }).promise()
            if (cwres.Datapoints.length == 0 || cwres.Datapoints[0].Sum == 0){
                sum += 16 // $16 per month
                addTable(reg,lb.LoadBalancerName, 16, "network load balancer did not have any requests in 30 days");
            }
        }
        
    }
    return sum
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
    var start = new Date()
    start.setDate(start.getDate() - 29 )
    var rds = new AWS.RDS({apiVersion: '2014-10-31'});
    var cw = new AWS.CloudWatch()

    log.innerHTML += "Analyzing RDS...</br>";
    log.scrollTop = log.scrollHeight;
    var res = await rds.describeDBInstances().promise();
    console.log(res)
    var dbs = {}
    for (var v of res.DBInstances) {
        dbs[v.DBInstanceIdentifier] = v
        var cwres = await cw.getMetricStatistics({
            StartTime: start,
            EndTime: new Date(),
            MetricName: 'DatabaseConnections',
            Namespace: 'AWS/RDS', 
            Period: 3600*24*30, 
            Dimensions: [
            {
                Name: 'DBInstanceIdentifier', 
                Value: v.DBInstanceIdentifier,
            },
            ],
            Statistics: ["Sum"],
            Unit: "Count",
        }).promise()
        console.log(cwres)
        if (cwres.Datapoints.length == 0 || cwres.Datapoints[0].Sum == 0){
            sum += rdsCost(v)
            addTable(reg,v.DBInstanceIdentifier, rdsCost(v), "RDS instance did not have any active connections in 30 days");
        } else {
            console.log(v.DBInstanceIdentifier, cwres.Datapoints[0].Sum)
        }
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

function rdsCost(v) {
    var cost = dbPrices[v.Engine.substring(0,3)][v.DBInstanceClass]
    if (v.MultiAZ) {
        cost *= 2
    }
   return cost
}



var dbPrices = {
	"pos": {
		"db.t2.micro":     0.018,
		"db.t2.small":     0.036,
		"db.t2.medium":    0.073,
		"db.t2.large":     0.145,
		"db.t2.xlarge":    0.29,
		"db.t2.2xlarge":   0.58,
		"db.m4.large":     0.182,
		"db.m4.xlarge":    0.365,
		"db.m4.2xlarge":   0.73,
		"db.m4.4xlarge":   1.461,
		"db.m4.10xlarge":  3.654,
		"db.m4.16xlarge":  5.844,
		"db.r4.large":     0.25,
		"db.r4.xlarge":    0.50,
		"db.r4.2xlarge":   1.00,
		"db.r4.4xlarge":   2.00,
		"db.r4.8xlarge":   4.00,
		"db.r4.16xlarge":  8.00,
		"db.r3.large":     0.25,
		"db.r3.xlarge":    0.50,
		"db.r3.2xlarge":   0.995,
		"db.r3.4xlarge":   1.99,
		"db.r3.8xlarge":   3.98,
		"db.t3.micro":     0.018,
		"db.t3.small":     0.036,
		"db.t3.medium":    0.072,
		"db.t3.large":     0.145,
		"db.t3.xlarge":    0.29,
		"db.t3.2xlarge":   0.579,
		"db.m6g.large":    0.159,
		"db.m6g.xlarge":   0.318,
		"db.m6g.2xlarge":  0.636,
		"db.m6g.4xlarge":  1.272,
		"db.m6g.8xlarge":  2.544,
		"db.m6g.12xlarge": 3.816,
		"db.m6g.16xlarge": 5.088,
		"db.m5.large":     0.178,
		"db.m5.xlarge":    0.356,
		"db.m5.2xlarge":   0.712,
		"db.m5.4xlarge":   1.424,
		"db.m5.8xlarge":   2.848,
		"db.m5.12xlarge":  4.272,
		"db.m5.16xlarge":  5.696,
		"db.m5.24xlarge":  8.544,
		"db.r6g.large":    0.225,
		"db.r6g.xlarge":   0.45,
		"db.r6g.2xlarge":  0.899,
		"db.r6g.4xlarge":  1.798,
		"db.r6g.8xlarge":  3.597,
		"db.r6g.12xlarge": 5.395,
		"db.r6g.16xlarge": 7.194,
		"db.r5.large":     0.25,
		"db.r5.xlarge":    0.50,
		"db.r5.2xlarge":   1.00,
		"db.r5.4xlarge":   2.00,
		"db.r5.8xlarge":   4.00,
		"db.r5.12xlarge":  6.00,
		"db.r5.16xlarge":  8.00,
		"db.r5.24xlarge":  12.00,
	},
	"mys": {
		"db.t2.micro":     0.017,
		"db.t2.small":     0.034,
		"db.t2.medium":    0.068,
		"db.t2.large":     0.136,
		"db.t2.xlarge":    0.272,
		"db.t2.2xlarge":   0.544,
		"db.m4.large":     0.175,
		"db.r4.large":     0.24,
		"db.r4.xlarge":    0.48,
		"db.r4.2xlarge":   0.96,
		"db.r4.4xlarge":   1.92,
		"db.r4.8xlarge":   3.84,
		"db.r4.16xlarge":  7.68,
		"db.r3.large":     0.24,
		"db.r3.xlarge":    0.475,
		"db.r3.2xlarge":   0.945,
		"db.r3.4xlarge":   1.89,
		"db.r3.8xlarge":   3.78,
		"db.m4.xlarge":    0.35,
		"db.m4.2xlarge":   0.70,
		"db.m4.4xlarge":   1.401,
		"db.m4.10xlarge":  3.502,
		"db.m4.16xlarge":  5.60,
		"db.t3.micro":     0.017,
		"db.t3.small":     0.034,
		"db.t3.medium":    0.068,
		"db.m3.medium":    0.068,
		"db.t3.large":     0.136,
		"db.t3.xlarge":    0.272,
		"db.t3.2xlarge":   0.544,
		"db.m6g.large":    0.152,
		"db.m6g.xlarge":   0.304,
		"db.m6g.2xlarge":  0.608,
		"db.m6g.4xlarge":  1.216,
		"db.m6g.8xlarge":  2.432,
		"db.m6g.12xlarge": 3.648,
		"db.m6g.16xlarge": 4.864,
		"db.m5.large":     0.171,
		"db.m5.xlarge":    0.342,
		"db.m5.2xlarge":   0.684,
		"db.m5.4xlarge":   1.368,
		"db.m5.8xlarge":   2.74,
		"db.m5.12xlarge":  4.104,
		"db.m5.16xlarge":  5.47,
		"db.m5.24xlarge":  8.208,
		"db.r6g.large":    0.215,
		"db.r6g.xlarge":   0.43,
		"db.r6g.2xlarge":  0.859,
		"db.r6g.4xlarge":  1.718,
		"db.r6g.8xlarge":  3.437,
		"db.r6g.12xlarge": 5.155,
		"db.r6g.16xlarge": 6.874,
		"db.r5.large":     0.24,
		"db.r5.xlarge":    0.48,
		"db.r5.2xlarge":   0.96,
		"db.r5.4xlarge":   1.92,
		"db.r5.8xlarge":   3.84,
		"db.r5.12xlarge":  5.76,
		"db.r5.16xlarge":  7.68,
		"db.r5.24xlarge":  11.52,
	},
	"ora": {
		"db.t3.micro":     0.017,
		"db.t3.small":     0.034,
		"db.t3.medium":    0.068,
		"db.t3.large":     0.136,
		"db.t3.xlarge":    0.272,
		"db.t3.2xlarge":   0.544,
		"db.m5.large":     0.171,
		"db.m5.xlarge":    0.342,
		"db.m5.2xlarge":   0.684,
		"db.m5.4xlarge":   1.368,
		"db.m5.8xlarge":   2.736,
		"db.m5.12xlarge":  4.104,
		"db.m5.16xlarge":  5.472,
		"db.m5.24xlarge":  8.208,
		"db.x1.16xlarge":  11.20,
		"db.x1.32xlarge":  22.40,
		"db.x1e.xlarge":   1.4011,
		"db.x1e.2xlarge":  2.8022,
		"db.x1e.4xlarge":  5.6045,
		"db.x1e.8xlarge":  11.209,
		"db.x1e.16xlarge": 22.4179,
		"db.x1e.32xlarge": 44.8358,
		"db.r5.large":     0.233,
		"db.r5.xlarge":    0.466,
		"db.r5.2xlarge":   0.932,
		"db.r5.4xlarge":   1.864,
		"db.r5.8xlarge":   3.728,
		"db.r5.12xlarge":  5.592,
		"db.r5.16xlarge":  7.456,
		"db.r5.24xlarge":  11.184,
		"db.z1d.large":    0.344,
		"db.z1d.xlarge":   0.6879,
		"db.z1d.2xlarge":  1.3758,
		"db.z1d.3xlarge":  2.0637,
		"db.z1d.6xlarge":  4.1274,
		"db.z1d.12xlarge": 8.2549,
	},
	"mar": {
		"db.t3.micro":     0.017,
		"db.t3.small":     0.034,
		"db.t3.medium":    0.068,
		"db.t3.large":     0.136,
		"db.t3.xlarge":    0.272,
		"db.t3.2xlarge":   0.544,
		"db.m6g.large":    0.152,
		"db.m6g.xlarge":   0.304,
		"db.m6g.2xlarge":  0.608,
		"db.m6g.4xlarge":  1.216,
		"db.m6g.8xlarge":  2.432,
		"db.m6g.12xlarge": 3.648,
		"db.m6g.16xlarge": 4.864,
		"db.m5.large":     0.171,
		"db.m5.xlarge":    0.342,
		"db.m5.2xlarge":   0.684,
		"db.m5.4xlarge":   1.368,
		"db.m5.8xlarge":   2.74,
		"db.m5.12xlarge":  4.104,
		"db.m5.16xlarge":  5.47,
		"db.m5.24xlarge":  8.208,
		"db.r6g.large":    0.215,
		"db.r6g.xlarge":   0.43,
		"db.r6g.2xlarge":  0.859,
		"db.r6g.4xlarge":  1.718,
		"db.r6g.8xlarge":  3.437,
		"db.r6g.12xlarge": 5.155,
		"db.r6g.16xlarge": 6.874,
		"db.r5.large":     0.24,
		"db.r5.xlarge":    0.48,
		"db.r5.2xlarge":   0.96,
		"db.r5.4xlarge":   1.92,
		"db.r5.8xlarge":   3.84,
		"db.r5.12xlarge":  5.76,
		"db.r5.16xlarge":  7.68,
		"db.r5.24xlarge":  11.52,
	},
	"sql": {
		"db.t3.small":    0.044,
		"db.t3.medium":   0.088,
		"db.t3.large":    0.162,
		"db.t3.xlarge":   0.35,
		"db.m5.large":    0.977,
		"db.m5.xlarge":   1.224,
		"db.m5.2xlarge":  2.548,
		"db.m5.4xlarge":  5.047,
		"db.m5.8xlarge":  9.792,
		"db.m5.12xlarge": 14.688,
		"db.m5.16xlarge": 19.584,
		"db.m5.24xlarge": 29.376,
		"db.m4.large":    0.977,
		"db.m4.xlarge":   1.224,
		"db.m4.2xlarge":  2.548,
		"db.m4.4xlarge":  5.047,
		"db.m4.8xlarge":  9.792,
		"db.m4.12xlarge": 14.688,
		"db.m4.16xlarge": 19.584,
		"db.m4.24xlarge": 29.376,
	},
	"aur": {
		"db.t2.small":    0.041,
		"db.t2.medium":   0.082,
		"db.r4.large":    0.29,
		"db.r4.xlarge":   0.58,
		"db.r4.2xlarge":  1.16,
		"db.r4.4xlarge":  2.32,
		"db.r4.8xlarge":  4.64,
		"db.r4.16xlarge": 9.28,
		"db.r3.large":    0.29,
		"db.r3.xlarge":   0.58,
		"db.r3.2xlarge":  1.16,
		"db.r3.4xlarge":  2.32,
		"db.r3.8xlarge":  4.64,
		"db.t3.small":    0.041,
		"db.t3.medium":   0.082,
		"db.r5.large":    0.29,
		"db.r5.xlarge":   0.58,
		"db.r5.2xlarge":  1.16,
		"db.r5.4xlarge":  2.32,
		"db.r5.8xlarge":  4.64,
		"db.r5.12xlarge": 6.96,
		"db.r5.16xlarge": 9.28,
		"db.r5.24xlarge": 13.92,
	},
}


//TOOD:  Elastic IPs not attached to running EC2 instances 