import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const vpc = new awsx.ec2.Vpc("self-hosted-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 2,
  subnetSpecs: [
    {
      type: awsx.ec2.SubnetType.Public,
      name: "public-subnet",
    },
    {
      type: awsx.ec2.SubnetType.Private,
      name: "private-subnet",
    },
    {
      type: awsx.ec2.SubnetType.Isolated,
      name: "isolated-subnet",
    },
  ],
  tags: {
    name: "pk-vpc",
  },
  natGateways: {
    strategy: "Single",
  },
  enableDnsSupport: true,
  enableDnsHostnames: true,
});

const accountId = pulumi.output(aws.getCallerIdentity()).accountId;

const key = new aws.kms.Key("kmsKey", {
  policy: aws.iam.getPolicyDocumentOutput({
    version: "2012-10-17",
    statements: [
      {
        effect: "Allow",
        principals: [
          {
            type: "AWS",
            identifiers: [pulumi.interpolate`arn:aws:iam::${accountId}:root`],
          },
        ],
        actions: ["kms:*"],
        resources: ["*"],
      },
      {
        effect: "Allow",
        principals: [
          {
            type: "AWS",
            identifiers: [pulumi.interpolate`arn:aws:iam::${accountId}:root`],
          },
        ],
        actions: [
          "kms:Create*",
          "kms:Describe*",
          "kms:Enable*",
          "kms:List*",
          "kms:Put*",
          "kms:Update*",
          "kms:Revoke*",
          "kms:Disable*",
          "kms:Get*",
          "kms:Delete*",
          "kms:TagResource",
          "kms:UntagResource",
          "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion",
        ],
        resources: ["*"]
      },
    ],
  }).json,
});

export const vpcId = vpc.vpcId;
export const publicSubnets = vpc.publicSubnetIds;
export const privateSubnets = vpc.privateSubnetIds;
export const isolatedSubnets = vpc.isolatedSubnetIds;
export const kmsServiceKetId = key.keyId
