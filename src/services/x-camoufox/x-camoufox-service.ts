import {
  XCamoufoxTool,
  type RegisterAccountInput,
  type RegisterAccountResult,
  type PostTweetInput,
  type PostTweetResult
} from '../../tools/x-camoufox-tool.js';

export type { RegisterAccountInput, RegisterAccountResult, PostTweetInput, PostTweetResult };

const tool = new XCamoufoxTool();

export class XCamoufoxService {
  async registerAccount(input: RegisterAccountInput): Promise<RegisterAccountResult> {
    return tool.registerAccount(input);
  }

  async postTweet(input: PostTweetInput): Promise<PostTweetResult> {
    return tool.postTweet(input);
  }
}
