import * as logger from "firebase-functions/logger";
import fetch from "node-fetch";
import { getToken } from "./auth";

const VERSION = "v1beta1";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const ORIGIN = `https://cloudscheduler.googleapis.com/${VERSION}/`;

export interface PubsubTarget {
  topicName: string;
  data?: string;
  attributes?: Record<string, string>;
}

export type HttpMethod = "POST" | "GET" | "HEAD" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";

export interface OauthToken {
  serviceAccountEmail: string;
  scope: string;
}

export interface OidcToken {
  serviceAccountEmail: string;
  audience: string;
}

export interface HttpTarget {
  uri: string;
  httpMethod: HttpMethod;
  headers?: Record<string, string>;
  body?: string;

  // oneof authorizationHeader
  oauthToken?: OauthToken;
  oidcToken?: OidcToken;
  // end oneof authorizationHeader;
}

export interface RetryConfig {
  retryCount?: number;
  maxRetryDuration?: number;
  maxBackoffDuration?: number;
  maxDoublings?: number;
}

export interface Job {
  name: string;
  schedule: string;
  description?: string;
  timeZone?: string;

  // oneof target
  httpTarget?: HttpTarget;
  pubsubTarget?: PubsubTarget;
  // end oneof target

  retryConfig?: {
    retryCount?: number;
    maxRetryDuration?: string;
    minBackoffDuration?: string;
    maxBackoffDuration?: string;
    maxDoublings?: number;
  };
}

/**
 * Creates a cloudScheduler job.
 * If another job with that name already exists, this will return a 409.
 * @param job The job to create.
 */
export async function createJob(job: Job): Promise<any> {
  // the replace below removes the portion of the schedule name after the last /
  // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
  // projects/my-proj/locations/us-central1/jobs
  const strippedName = job.name.substring(0, job.name.lastIndexOf("/"));
  const res = await fetch(`${ORIGIN}${strippedName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await getToken()}`,
    },
    body: JSON.stringify({
      timeZone: DEFAULT_TIME_ZONE,
      ...job,
    }),
  });

  if (!res.ok) {
    throw new Error(`CreateJob failed with status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Deletes a cloudScheduler job with the given name.
 * Returns a 404 if no job with that name exists.
 * @param name The name of the job to delete.
 */
export async function deleteJob(name: string): Promise<any> {
  const res = await fetch(`${ORIGIN}${name}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
    },
  });
  if (!res.ok) {
    throw new Error(`DeleteJob failed with status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Gets a cloudScheduler job with the given name.
 * If no job with that name exists, this will return a 404.
 * @param name The name of the job to get.
 */
export async function getJob(name: string): Promise<any> {
  const res = await fetch(`${ORIGIN}${name}`,{
    headers: {
      Authorization: `Bearer ${await getToken()}`,
    },
  });
  if (res.status === 404) {
    return;
  }
  if (!res.ok) {
    throw new Error(`DeleteJob failed with status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Updates a cloudScheduler job.
 * Returns a 404 if no job with that name exists.
 * @param job A job to update.
 */
export async function updateJob(job: Job): Promise<any> {
  // the replace below removes the portion of the schedule name after the last /
  // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
  // projects/my-proj/locations/us-central1/jobs
  const res = await fetch(`${ORIGIN}${job.name}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${await getToken()}`,
    },
    body: JSON.stringify({
      timeZone: DEFAULT_TIME_ZONE,
      ...job,
    }),
  });

  if (!res.ok) {
    throw new Error(`CreateJob failed with status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Checks for a existing job with the given name.
 * If none is found, it creates a new job.
 * If one is found, and it is identical to the job parameter, it does nothing.
 * Otherwise, if one is found and it is different from the job param, it updates the job.
 * @param job A job to check for and create, replace, or leave as appropriate.
 * @throws { FirebaseError } if an error response other than 404 is received on the GET call
 * or if error response 404 is received on the POST call, indicating that cloud resource
 * location is not set.
 */
export async function createOrReplaceJob(job: Job): Promise<any> {
  const jobName = job.name.split("/").pop();
  const existingJob = await getJob(job.name);
  // if no job is found, create one
  if (!existingJob) {
    let newJob;
    try {
      newJob = await createJob(job);
    } catch (err: any) {
      throw new Error(`Failed to create scheduler job ${job.name}: ${err.message}`);
    }
    logger.debug(`created scheduler job ${jobName}`);
    return newJob;
  }
  if (!job.timeZone) {
    // We set this here to avoid recreating schedules that use the default timeZone
    job.timeZone = DEFAULT_TIME_ZONE;
  }
  if (isIdentical(existingJob.body, job)) {
    logger.debug(`scheduler job ${jobName} is up to date, no changes required`);
    return;
  }
  const updatedJob = await updateJob(job);
  logger.debug(`updated scheduler job ${jobName}`);
  return updatedJob;
}

/**
 * Check if two jobs are functionally equivalent.
 * @param job a job to compare.
 * @param otherJob a job to compare.
 */
function isIdentical(job: Job, otherJob: Job): boolean {
  return (
    job &&
    otherJob &&
    job.schedule === otherJob.schedule &&
    job.timeZone === otherJob.timeZone &&
    JSON.stringify(job.retryConfig) === JSON.stringify(otherJob.retryConfig)
  );
}
