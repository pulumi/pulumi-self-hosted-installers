import { Config, interpolate } from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";

/*
Below defines an inline helper program which stands up a vpc and all required pieces, plus, acm/route53 and kms pieces required for the ECS Hosted solution.
*/
export const pulumiProgram = async () => {
    const config = new Config();
    const zoneName = config.require("zoneName");
    const domainName = config.require("domainName");

    const vpc = new awsx.ec2.Vpc("vpc", {
        cidrBlock: "10.100.0.0/24"
    });

    const account = await aws.getCallerIdentity();

    // create cert
    const zone = await aws.route53.getZone({
        name: zoneName
    });

    const cert = new aws.acm.Certificate("cert", {
        domainName: `*.${domainName}`,
        validationMethod: "DNS"
    });

    const { resourceRecordName, resourceRecordValue, resourceRecordType } = cert.domainValidationOptions[0];
    const record = new aws.route53.Record("cert-record", {
        name: resourceRecordName,
        records: [resourceRecordValue],
        type: resourceRecordType,
        zoneId: zone.id,
        ttl: 60
    });

    new aws.acm.CertificateValidation("cert-validation", {
        certificateArn: cert.arn,
        validationRecordFqdns: [record.fqdn]
    });

    const key = new aws.kms.Key("service-key", {
        policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "Enable IAM User Permissions",
                    Effect: "Allow",
                    Principal: {
                        AWS: `arn:aws:iam::${account.accountId}:root`
                    },
                    Action: "kms:*",
                    Resource: "*"
                },
                {
                    Sid: "Allow access for Key Administrators",
                    Effect: "Allow",
                    Principal: {
                        AWS: `arn:aws:iam::${account.accountId}:root`
                    },
                    Action: [
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
                        "kms:CancelKeyDeletion"
                    ],
                    Resource: "*"
                }]
        })
    });

    return {
        vpcId: vpc.id,
        publicSubnetIds: vpc.publicSubnetIds,
        privateSubnetIds: vpc.privateSubnetIds,
        isolatedSubnetIds: vpc.isolatedSubnetIds,
        acmCertificateArn: cert.arn,
        kmsServiceKeyId: key.keyId
    };
};