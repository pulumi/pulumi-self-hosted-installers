import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as cmd from "@pulumi/command";

import { config } from "./config";

// Security group to allow ssh access
const securityGroup = new aws.ec2.SecurityGroup(`${config.baseName}-dockerhost-secgrp`, {
  description: "Allow SSH access",
  vpcId: config.vpcId,
  ingress: [{
      protocol: "tcp",
      fromPort: 22,
      toPort: 22,
      cidrBlocks: ["0.0.0.0/0"], // Allow from any IP address
  }],
  egress: [{
      protocol: "-1", // Allow all outbound traffic
      fromPort: 0,
      toPort: 0,
      cidrBlocks: ["0.0.0.0/0"],
  }],
  tags: {
      Name: `${config.baseName}-dockerhost-secgrp`
  },
});

// Create a keypair to use for the Docker host
const keyPair = new aws.ec2.KeyPair(`${config.baseName}-keypair`, {
  keyName: `${config.baseName}-keypair`, 
  publicKey: config.dockerHostPublicKey,
});

// Get the latest Amazon Linux 2 AMI
const ami = aws.ec2.getAmi({
  filters: [{
      name: "name",
      values: ["al2023-ami-2023.*-kernel-6.1-x86_64"],
  }],
  owners: ["amazon"],
  mostRecent: true,
}).then(result => result.id);

// name for the Docker host
const dockerHostName = `${config.baseName}-dockerhost`;

// User data script to install Docker
const userData = `#!/bin/bash
sudo yum update -y
sudo yum install -y docker npm git
sudo service docker start
sudo usermod -a -G docker ec2-user
`;


const dockerHost = new aws.ec2.Instance(dockerHostName, {
  ami: ami,
  instanceType: config.dockerHostInstanceType,
  iamInstanceProfile: config.instanceProfileName,
  keyName: keyPair.keyName,
  subnetId: config.dockerHostSubnetId,
  userData: userData,
  vpcSecurityGroupIds: [securityGroup.id],
  tags: {
      Name: dockerHostName
  },
});

export const dockerHostPublicIp = dockerHost.publicIp

// Install the docker installer
const downloadInstaller = new cmd.remote.Command("download-installer", {
  create: "git clone https://github.com/pulumi/pulumi-self-hosted-installers.git && mv pulumi-self-hosted-installers/local-docker ~/ && rm -rf pulumi-self-hosted-installers",
  connection: {
      host: dockerHostPublicIp,
      user: "ec2-user",
      privateKey: config.dockerHostPrivateKey,
  }
}, {dependsOn: [dockerHost]});