// Emergency stop for the autonomous publishing pipeline.
//
// The presence of a file at content/SCHEDULER_STOP pauses every generating
// and publishing path the instant it appears. It is checked before the
// scheduler starts a cycle and before run.mjs creates a job or promotes a
// draft, so an operator can halt automation with a single file drop — no
// flags, no service to stop, no rebuild.
//
// Recovery commands are deliberately NOT blocked: during an emergency you
// must still be able to review a stop (--resolve) or pull a bad article
// (--unpublish). The stop only prevents NEW generation and NEW publication.
//
// To resume: delete content/SCHEDULER_STOP.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { repo } from './job.mjs';

export const stopFile = path.join(repo, 'content', 'SCHEDULER_STOP');
export const stopExists = () => existsSync(stopFile);
export const STOP_HINT = 'content/SCHEDULER_STOP exists — the autonomous pipeline is paused. '
  + 'Delete that file to resume generating and publishing.';
