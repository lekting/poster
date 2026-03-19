import { DataSource, Repository } from 'typeorm';
import { CategoryEntity } from '../../db/entities/index.js';

export interface CreateCategoryInput {
  name: string;
  slug: string;
}

export class CategoryService {
  private repo: Repository<CategoryEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(CategoryEntity);
  }

  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    const entity = this.repo.create(input);
    return this.repo.save(entity);
  }

  async getAll(): Promise<CategoryEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async getById(id: string): Promise<CategoryEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async getBySlug(slug: string): Promise<CategoryEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  /** Find existing category by slug or create new one. */
  async findOrCreate(input: CreateCategoryInput): Promise<CategoryEntity> {
    const existing = await this.getBySlug(input.slug);
    if (existing) return existing;
    return this.create(input);
  }

  async update(
    id: string,
    input: Partial<CreateCategoryInput>
  ): Promise<CategoryEntity | null> {
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
