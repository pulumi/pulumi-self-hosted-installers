import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface StatePoliciesOutputs {
  checkpointsS3BucketName: pulumi.Output<string>;
  policyPacksS3BucketName: pulumi.Output<string>;
  eventsS3BucketName: pulumi.Output<string>;
}

export interface StatePoliciesArgs {
  checkpointsS3BucketName?: string;
  policyPacksS3BucketName?: string;
  eventsS3BucketName?: string;
}

export class StatePoliciesMGMTResources extends pulumi.ComponentResource {
  public readonly checkpointsS3BucketName: pulumi.Output<string>;
  public readonly policyPacksS3BucketName: pulumi.Output<string>;
  public readonly eventsS3BucketName: pulumi.Output<string>;

  constructor(
    name: string,
    args: StatePoliciesArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:StatePolicies", name, {}, opts);

    const config = new pulumi.Config();
    const baseName = config.require("baseName");

    const checkpointsS3BucketName =
      args.checkpointsS3BucketName || config.get("checkpointsS3BucketName");
    const policyPacksS3BucketName =
      args.policyPacksS3BucketName || config.get("policyPacksS3BucketName");
    const eventsS3BucketName =
      args.eventsS3BucketName || config.get("eventsS3BucketName");

    ///////////////
    // Use provided S3 bucket or create S3 Buckets as applicable.
    if (checkpointsS3BucketName) {
      this.checkpointsS3BucketName = pulumi.output(checkpointsS3BucketName);
    } else {
      const checkpointsBucket = new aws.s3.Bucket(
        `${baseName}-checkpoints`,
        {},
        { protect: true, parent: this }
      );
      this.checkpointsS3BucketName = checkpointsBucket.bucket;
    }

    if (policyPacksS3BucketName) {
      this.policyPacksS3BucketName = pulumi.output(policyPacksS3BucketName);
    } else {
      const policyPacksBucket = new aws.s3.Bucket(
        `${baseName}-policypacks`,
        {},
        { protect: true, parent: this }
      );
      this.policyPacksS3BucketName = policyPacksBucket.bucket;
    }

    if (eventsS3BucketName) {
      this.eventsS3BucketName = pulumi.output(eventsS3BucketName);
    } else {
      const eventsBucket = new aws.s3.Bucket(
        `${baseName}-events`,
        {},
        { protect: true, parent: this }
      );
      this.eventsS3BucketName = eventsBucket.bucket;
    }

    this.registerOutputs({
      checkpointsS3BucketName: this.checkpointsS3BucketName,
      policyPacksS3BucketName: this.policyPacksS3BucketName,
      eventsS3BucketName: this.eventsS3BucketName,
    });
  }
}
