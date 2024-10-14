import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { config } from "./config";

// These roles are either provided by the user or created in this stack.
export let instanceRoleName: string | pulumi.Output<string>; 
export let instanceProfileName: string | pulumi.Output<string>;
export let databaseMonitoringRoleArn: string | pulumi.Output<string>;


// If the user provided the roles, use them instead of creating new ones.
// It's an all-or-nothing situation, so if one is provided, they all must be.
if (config.instanceRoleName && config.instanceProfileName && config.databaseMonitoringRoleArn) {
    instanceRoleName = config.instanceRoleName;
    instanceProfileName = config.instanceProfileName;
    databaseMonitoringRoleArn = config.databaseMonitoringRoleArn;
} else {
    // Create the roles.
    /// Instance Role ///
    const instanceRole = new aws.iam.Role(`${config.baseName}-instanceRole`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(aws.iam.Principals.Ec2Principal),
    });

    // S3 policy used by Pulumi services
    const instanceRoleS3Policy = new aws.iam.RolePolicyAttachment(`${config.baseName}-instanceS3Access`, {
        policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
        role: instanceRole 
    })

    // Opensearch access
    const opensearchPolicy = new aws.iam.Policy(`${config.baseName}-esAccess`, {
        policy: {
            Version: "2012-10-17",
            Statement: [
                {
                    Action: [
                        "es:*"
                    ],
                    Effect: "Allow",
                    Resource: "*"
                }
            ]
        }
    });
    const openSearchPolicyAttachment = new aws.iam.RolePolicyAttachment(`${config.baseName}-instanceEsAccess`, {
        policyArn: opensearchPolicy.arn,
        role: instanceRole
    })

    instanceRoleName = instanceRole.name;

    const instanceProfile =  new aws.iam.InstanceProfile(`${config.baseName}-instanceProfile`, {role: instanceRoleName})
    instanceProfileName = instanceProfile.name;

    // used by RDS to publish metrics to CloudWatch
    const databaseMonitoringRole = new aws.iam.Role(`${config.baseName}-dbMonitoringRole`, {
        assumeRolePolicy: {
            Statement:[
                {
                    Action: "sts:AssumeRole",
                    Effect: "Allow",
                    Principal: {
                        Service: "monitoring.rds.amazonaws.com"
                    },
                    Sid: "AllowAssumeRole"
                }
            ],
            Version:"2012-10-17"
        },
        managedPolicyArns: [
            "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
        ],
    });
    databaseMonitoringRoleArn = databaseMonitoringRole.arn;
}

