import { DataSource, Repository } from 'typeorm';
import { PersonaEntity } from '../../db/entities/index.js';

export interface CreatePersonaInput {
  name: string;
  slug: string;
  description?: string | null;
  systemPrompt?: string | null;
}

export class PersonaService {
  private repo: Repository<PersonaEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(PersonaEntity);
  }

  async create(input: CreatePersonaInput): Promise<PersonaEntity> {
    const entity = this.repo.create(input);
    return this.repo.save(entity);
  }

  async getAll(): Promise<PersonaEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async getById(id: string): Promise<PersonaEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getBySlug(slug: string): Promise<PersonaEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  /** Find existing persona by slug or create new one. */
  async findOrCreate(input: CreatePersonaInput): Promise<PersonaEntity> {
    const existing = await this.getBySlug(input.slug);
    if (existing) return existing;
    return this.create(input);
  }

  async update(
    id: string,
    input: Partial<CreatePersonaInput>
  ): Promise<PersonaEntity | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    Object.assign(entity, input);
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
