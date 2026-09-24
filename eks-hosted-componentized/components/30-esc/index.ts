import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface ESCOutputs {
  escBucketName: pulumi.Output<string>;
}

export interface ESCArgs {
  escBucketName?: string;
}

export class ESCResources extends pulumi.ComponentResource {
  public readonly escBucketName: pulumi.Output<string>;

  constructor(
    name: string,
    args: ESCArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:ESC", name, {}, opts);

    const config = new pulumi.Config();
    const baseName = config.require("baseName");
    const escBucketName = args.escBucketName || config.get("escBucketName");

    ///////////////
    // Resources for ESC feature - which at this point is very minimal, but kept in a separate stack in case future features require more infrastructure..

    // Create S3 Bucket for the ESC storage - if not using an existing bucket.
    if (!escBucketName) {
      const escBucket = new aws.s3.Bucket(
        `${baseName}-esc`,
        {},
        { protect: true, parent: this }
      );
      this.escBucketName = escBucket.id;
    } else {
      this.escBucketName = pulumi.output(escBucketName);
    }

    this.registerOutputs({
      escBucketName: this.escBucketName,
    });
  }
}
