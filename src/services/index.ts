import type { DataSource } from 'typeorm';
import { AccountService } from './account/account-service.js';
import { CampaignService } from './campaign/campaign-service.js';
import { CategoryService } from './category/category-service.js';
import { LLMService } from './llm/llm-service.js';
import { MailTmService } from './mail-tm/mail-tm-service.js';
import { PersonaService } from './persona/persona-service.js';
import { PostService } from './post/post-service.js';
import { RegistrationService } from './registration/registration-service.js';
import { UserService } from './user/user-service.js';
import { XCamoufoxService } from './x-camoufox/x-camoufox-service.js';
import { ThreadsCamoufoxService } from './threads-camoufox/threads-camoufox-service.js';

export interface AppServices {
  userService: UserService;
  personaService: PersonaService;
  categoryService: CategoryService;
  accountService: AccountService;
  campaignService: CampaignService;
  postService: PostService;
  registrationService: RegistrationService;
  llmService: LLMService;
  xCamoufoxService: XCamoufoxService;
  threadsCamoufoxService: ThreadsCamoufoxService;
  mailTmService: MailTmService;
}

export function buildServices(ds: DataSource): AppServices {
  return {
    userService: new UserService(ds),
    personaService: new PersonaService(ds),
    categoryService: new CategoryService(ds),
    accountService: new AccountService(ds),
    campaignService: new CampaignService(ds),
    postService: new PostService(ds),
    registrationService: new RegistrationService(ds),
    llmService: new LLMService(),
    xCamoufoxService: new XCamoufoxService(),
    threadsCamoufoxService: new ThreadsCamoufoxService(),
    mailTmService: new MailTmService()
  };
}
