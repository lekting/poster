import {
  ThreadsCamoufoxTool,
  type ThreadsLoginInput,
  type ThreadsLoginResult,
  type ThreadsPostInput,
  type ThreadsPostResult,
  type ThreadsReplyInput,
  type ThreadsReplyResult
} from '../../tools/threads-camoufox-tool.js';

export type {
  ThreadsLoginInput,
  ThreadsLoginResult,
  ThreadsPostInput,
  ThreadsPostResult,
  ThreadsReplyInput,
  ThreadsReplyResult
};

const tool = new ThreadsCamoufoxTool();

export class ThreadsCamoufoxService {
  async login(input: ThreadsLoginInput): Promise<ThreadsLoginResult> {
    return tool.login(input);
  }

  async postThread(input: ThreadsPostInput): Promise<ThreadsPostResult> {
    return tool.postThread(input);
  }

  async replyToPost(input: ThreadsReplyInput): Promise<ThreadsReplyResult> {
    return tool.replyToPost(input);
  }
}
