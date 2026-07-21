const express = require('express');
const AWS = require('aws-sdk');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

AWS.config.update({ region: 'us-east-1' });

const ec2 = new AWS.EC2();
const cloudwatch = new AWS.CloudWatch();

async function getInstanceStatus(instanceId) {
  try {
    const data = await ec2.describeInstances({ InstanceIds: [instanceId] }).promise();
    const instance = data.Reservations[0].Instances[0];
    return {
      InstanceId: instance.InstanceId,
      State: instance.State.Name,
      InstanceType: instance.InstanceType,
      PrivateIp: instance.PrivateIpAddress || 'N/A',
      PublicIp: instance.PublicIpAddress || 'N/A',
      LaunchTime: instance.LaunchTime,
      VpcId: instance.VpcId || 'N/A',
      SubnetId: instance.SubnetId || 'N/A',
      Tags: instance.Tags || []
    };
  } catch (err) {
    throw new Error(err.message);
  }
}

async function getInstanceMetrics(instanceId) {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 300000);

    const cpuParams = {
      Namespace: 'AWS/EC2',
      MetricName: 'CPUUtilization',
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average']
    };

    const networkInParams = {
      Namespace: 'AWS/EC2',
      MetricName: 'NetworkIn',
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average']
    };

    const networkOutParams = {
      Namespace: 'AWS/EC2',
      MetricName: 'NetworkOut',
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average']
    };

    const [cpuData, netInData, netOutData] = await Promise.all([
      cloudwatch.getMetricStatistics(cpuParams).promise(),
      cloudwatch.getMetricStatistics(networkInParams).promise(),
      cloudwatch.getMetricStatistics(networkOutParams).promise()
    ]);

    const cpu = cpuData.Datapoints.length > 0 ? cpuData.Datapoints[0].Average : 0;
    const netIn = netInData.Datapoints.length > 0 ? netInData.Datapoints[0].Average : 0;
    const netOut = netOutData.Datapoints.length > 0 ? netOutData.Datapoints[0].Average : 0;

    return {
      CPUUtilization: Math.round(cpu * 100) / 100,
      NetworkIn: Math.round(netIn * 100) / 100,
      NetworkOut: Math.round(netOut * 100) / 100
    };
  } catch (err) {
    return { CPUUtilization: 0, NetworkIn: 0, NetworkOut: 0, error: err.message };
  }
}

app.get('/api/instances', async (req, res) => {
  try {
    const data = await ec2.describeInstances().promise();
    const instances = [];
    for (const reservation of data.Reservations) {
      for (const instance of reservation.Instances) {
        const nameTag = instance.Tags.find(t => t.Key === 'Name');
        instances.push({
          InstanceId: instance.InstanceId,
          Name: nameTag ? nameTag.Value : 'Unnamed',
          State: instance.State.Name,
          InstanceType: instance.InstanceType,
          PrivateIp: instance.PrivateIpAddress || 'N/A',
          PublicIp: instance.PublicIpAddress || 'N/A',
          LaunchTime: instance.LaunchTime
        });
      }
    }
    res.json({ success: true, instances });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/instance/:id', async (req, res) => {
  try {
    const status = await getInstanceStatus(req.params.id);
    const metrics = await getInstanceMetrics(req.params.id);
    res.json({ success: true, ...status, metrics });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/instance/:id/start', async (req, res) => {
  try {
    await ec2.startInstances({ InstanceIds: [req.params.id] }).promise();
    res.json({ success: true, message: `Instance ${req.params.id} starting...` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/instance/:id/stop', async (req, res) => {
  try {
    await ec2.stopInstances({ InstanceIds: [req.params.id] }).promise();
    res.json({ success: true, message: `Instance ${req.params.id} stopping...` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/instance/:id/reboot', async (req, res) => {
  try {
    await ec2.rebootInstances({ InstanceIds: [req.params.id] }).promise();
    res.json({ success: true, message: `Instance ${req.params.id} rebooting...` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NOVA X Premium Control Panel running on http://0.0.0.0:${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
});
