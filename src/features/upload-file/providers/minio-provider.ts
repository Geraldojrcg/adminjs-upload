import fs from 'fs'
// eslint-disable-next-line import/no-extraneous-dependencies
import { type S3 } from 'aws-sdk'
import { UploadedFile } from 'adminjs'
import { ERROR_MESSAGES, DAY_IN_MINUTES } from '../constants.js'
import { BaseProvider } from './base-provider.js'

/**
 * AWS Credentials which can be set for S3 file upload.
 * If not given, 'aws-sdk' will try to fetch them from
 * environmental variables.
 * @memberof module:@adminjs/upload
 */
export type MinIoOptions = {
  /**
   * MinIo endpoint
   */
  endpoint: string
  /**
   * AWS IAM accessKeyId. By default its value is taken from AWS_ACCESS_KEY_ID env variable
   */
  accessKeyId?: string
  /**
   * AWS IAM secretAccessKey. By default its value is taken from AWS_SECRET_ACCESS_KEY env variable
   */
  secretAccessKey?: string

  /**
   * S3 Bucket where files will be stored
   */
  bucket: string
  /**
   * indicates how long links should be available after page load (in minutes).
   * Default to 24h. If set to 0 adapter will mark uploaded files as PUBLIC ACL.
   */
  expires?: number
}

export class MinIoProvider extends BaseProvider {
  private s3!: S3

  private endpoint!: string

  public expires!: number

  constructor(options: MinIoOptions) {
    super(options.bucket)
    this.setupS3Client(options)
  }

  private async setupS3Client(options: MinIoOptions) {
    try {
      // eslint-disable-next-line
      const S3Client = (await import('aws-sdk/clients/s3.js')).default
      this.expires = options.expires ?? DAY_IN_MINUTES
      this.endpoint = options.endpoint

      this.s3 = new S3Client({
        s3ForcePathStyle: true,
        signatureVersion: 'v4',
        ...options,
      })
    } catch (error) {
      throw new Error(ERROR_MESSAGES.NO_AWS_SDK)
    }
  }

  public async upload(file: UploadedFile, key: string): Promise<S3.ManagedUpload.SendData> {
    const uploadOptions = { partSize: 5 * 1024 * 1024, queueSize: 10 }
    const tmpFile = fs.createReadStream(file.path)
    const params: S3.PutObjectRequest = {
      Bucket: this.bucket,
      Key: key,
      Body: tmpFile,
    }
    if (!this.expires) {
      params.ACL = 'public-read'
    }
    return this.s3.upload(params, uploadOptions).promise()
  }

  public async delete(key: string, bucket: string): Promise<S3.DeleteObjectOutput> {
    return this.s3.deleteObject({ Key: key, Bucket: bucket }).promise()
  }

  public async path(key: string, bucket: string): Promise<string> {
    if (this.expires) {
      return this.s3.getSignedUrl('getObject', {
        Key: key,
        Bucket: bucket,
        Expires: this.expires,
      })
    }
    // https://bucket.s3.amazonaws.com/key
    return `${this.endpoint}/${bucket}/${key}`
  }
}
