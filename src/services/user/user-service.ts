import { DataSource, Repository } from 'typeorm';
import { TelegramUserEntity } from '../../db/entities/index.js';

export interface EnsureUserInput {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export class UserService {
  private repo: Repository<TelegramUserEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(TelegramUserEntity);
  }

  async ensureUser(input: EnsureUserInput): Promise<TelegramUserEntity> {
    let user = await this.repo.findOne({ where: { telegramId: input.telegramId } });
    if (user) {
      user.username = input.username;
      user.firstName = input.firstName;
      user.lastName = input.lastName;
      await this.repo.save(user);
      return user;
    }
    user = this.repo.create({
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      isAdmin: 0
    });
    return this.repo.save(user);
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.repo.findOne({ where: { id: userId } });
    return user?.isAdmin === 1;
  }

  async getById(id: string): Promise<TelegramUserEntity | null> {
    return this.repo.findOne({ where: { id } });
  }
}
