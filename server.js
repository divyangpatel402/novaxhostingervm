const express = require('express');
const AWS = require('aws-sdk');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

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
    const data = await ec2.describeInstances({ InstanceIds: [req.params.id] }).promise();
    const inst = data.Reservations[0].Instances[0];

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 300000);
    const metricParams = (metric) => ({
      Namespace: 'AWS/EC2', MetricName: metric,
      Dimensions: [{ Name: 'InstanceId', Value: req.params.id }],
      StartTime: startTime, EndTime: endTime, Period: 300, Statistics: ['Average']
    });

    const [cpu, netIn, netOut] = await Promise.all([
      cloudwatch.getMetricStatistics(metricParams('CPUUtilization')).promise(),
      cloudwatch.getMetricStatistics(metricParams('NetworkIn')).promise(),
      cloudwatch.getMetricStatistics(metricParams('NetworkOut')).promise()
    ]);

    res.json({
      success: true,
      InstanceId: inst.InstanceId,
      State: inst.State.Name,
      InstanceType: inst.InstanceType,
      PrivateIp: inst.PrivateIpAddress || 'N/A',
      PublicIp: inst.PublicIpAddress || 'N/A',
      LaunchTime: inst.LaunchTime,
      VpcId: inst.VpcId || 'N/A',
      SubnetId: inst.SubnetId || 'N/A',
      metrics: {
        CPUUtilization: cpu.Datapoints.length ? Math.round(cpu.Datapoints[0].Average * 100) / 100 : 0,
        NetworkIn: netIn.Datapoints.length ? Math.round(netIn.Datapoints[0].Average * 100) / 100 : 0,
        NetworkOut: netOut.Datapoints.length ? Math.round(netOut.Datapoints[0].Average * 100) / 100 : 0
      }
    });
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

const ec2 = new AWS.EC2();
const cloudwatch = new AWS.CloudWatch();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NOVA X Premium Control Panel on http://0.0.0.0:${PORT}`);
});
