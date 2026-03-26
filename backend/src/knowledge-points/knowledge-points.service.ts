import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository } from 'typeorm';
import { KnowledgePointEntity } from './entities/knowledge-point.entity';
import { CreateKnowledgePointDto } from './dto/create-knowledge-point.dto';
import { UpdateKnowledgePointDto } from './dto/update-knowledge-point.dto';
import { QueryKnowledgePointsDto } from './dto/query-knowledge-points.dto';

@Injectable()
export class KnowledgePointsService {
  constructor(
    @InjectRepository(KnowledgePointEntity)
    private readonly repo: TreeRepository<KnowledgePointEntity>,
  ) {}

  /**
   * 创建知识点
   */
  async create(
    dto: CreateKnowledgePointDto,
    userId?: string,
  ): Promise<KnowledgePointEntity> {
    // 验证父节点是否存在
    if (dto.parentId) {
      const parent = await this.repo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent knowledge point ${dto.parentId} not found`,
        );
      }
      // 验证层级关系
      if (dto.level <= parent.level) {
        throw new BadRequestException(
          `Child level (${dto.level}) must be greater than parent level (${parent.level})`,
        );
      }
    }

    const entity = this.repo.create({
      ...dto,
      createdBy: userId,
    });

    return this.repo.save(entity);
  }

  /**
   * 获取知识点树（完整树形结构）
   */
  async getTree(subjectCode?: string): Promise<KnowledgePointEntity[]> {
    const queryBuilder = this.repo
      .createQueryBuilder('kp')
      .where('kp.isActive = :isActive', { isActive: true })
      .orderBy('kp.level', 'ASC')
      .addOrderBy('kp.sortOrder', 'ASC')
      .addOrderBy('kp.name', 'ASC');

    if (subjectCode) {
      queryBuilder.andWhere('kp.subjectCode = :subjectCode', { subjectCode });
    }

    const allNodes = await queryBuilder.getMany();

    // 手动构建树形结构
    interface TreeNode {
      id: string;
      name: string;
      description?: string;
      level: number;
      subjectCode?: string;
      sortOrder: number;
      isActive: boolean;
      metadata?: {
        difficulty?: number;
        importance?: number;
        examFrequency?: number;
        tags?: string[];
      };
      parentId?: string;
      createdBy?: string;
      createdAt: Date;
      updatedAt: Date;
      children: TreeNode[];
    }
    
    const nodeMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // 第一遍：创建映射
    allNodes.forEach((node) => {
      nodeMap.set(node.id, { 
        id: node.id,
        name: node.name,
        description: node.description,
        level: node.level,
        subjectCode: node.subjectCode,
        sortOrder: node.sortOrder,
        isActive: node.isActive,
        metadata: node.metadata,
        parentId: node.parentId,
        createdBy: node.createdBy,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        children: [] 
      });
    });

    // 第二遍：建立父子关系
    allNodes.forEach((node) => {
      const currentNode = nodeMap.get(node.id);
      if (!currentNode) return;
      
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) {
          parent.children.push(currentNode);
        }
      } else {
        rootNodes.push(currentNode);
      }
    });

    return rootNodes as any;
  }

  /**
   * 获取指定节点的子树
   */
  async getDescendantsTree(id: string): Promise<KnowledgePointEntity> {
    const node = await this.repo.findOne({ where: { id } });
    if (!node) {
      throw new NotFoundException(`Knowledge point ${id} not found`);
    }

    return this.repo.findDescendantsTree(node);
  }

  /**
   * 查询知识点列表（扁平化）
   */
  async findAll(query: QueryKnowledgePointsDto): Promise<KnowledgePointEntity[]> {
    const queryBuilder = this.repo.createQueryBuilder('kp');

    if (query.subjectCode) {
      queryBuilder.andWhere('kp.subjectCode = :subjectCode', {
        subjectCode: query.subjectCode,
      });
    }

    if (query.level) {
      queryBuilder.andWhere('kp.level = :level', { level: query.level });
    }

    if (query.parentId) {
      queryBuilder.andWhere('kp.parentId = :parentId', {
        parentId: query.parentId,
      });
    }

    if (!query.includeInactive) {
      queryBuilder.andWhere('kp.isActive = :isActive', { isActive: true });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(kp.name LIKE :search OR kp.description LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    queryBuilder
      .orderBy('kp.level', 'ASC')
      .addOrderBy('kp.sortOrder', 'ASC')
      .addOrderBy('kp.name', 'ASC');

    return queryBuilder.getMany();
  }

  /**
   * 获取单个知识点详情
   */
  async findOne(id: string): Promise<KnowledgePointEntity> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });

    if (!entity) {
      throw new NotFoundException(`Knowledge point ${id} not found`);
    }

    return entity;
  }

  /**
   * 更新知识点
   */
  async update(
    id: string,
    dto: UpdateKnowledgePointDto,
  ): Promise<KnowledgePointEntity> {
    const entity = await this.findOne(id);

    // 如果更新了父节点，需要验证
    if (dto.parentId && dto.parentId !== entity.parentId) {
      const newParent = await this.repo.findOne({
        where: { id: dto.parentId },
      });
      if (!newParent) {
        throw new NotFoundException(`Parent ${dto.parentId} not found`);
      }
      // 防止循环引用
      if (dto.parentId === id) {
        throw new BadRequestException('Cannot set self as parent');
      }
    }

    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  /**
   * 删除知识点（软删除）
   */
  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);

    // 检查是否有子节点
    const children = await this.repo.count({ where: { parentId: id } });
    if (children > 0) {
      throw new BadRequestException(
        'Cannot delete knowledge point with children. Please delete children first or disable it.',
      );
    }

    entity.isActive = false;
    await this.repo.save(entity);
  }

  /**
   * 获取知识点的完整路径（面包屑）
   */
  async getPath(id: string): Promise<KnowledgePointEntity[]> {
    const node = await this.findOne(id);
    const ancestors = await this.repo.findAncestors(node);
    return ancestors;
  }

  /**
   * 批量创建知识点（用于初始化或导入）
   */
  async bulkCreate(
    dtos: CreateKnowledgePointDto[],
    userId?: string,
  ): Promise<KnowledgePointEntity[]> {
    const entities = dtos.map((dto) =>
      this.repo.create({
        ...dto,
        createdBy: userId,
      }),
    );

    return this.repo.save(entities);
  }

  /**
   * 根据名称路径查找知识点
   * 例如：['数学', '数据结构', '链表'] => 返回链表节点
   */
  async findByPath(namePath: string[]): Promise<KnowledgePointEntity | null> {
    let currentParentId: string | null = null;

    for (const name of namePath) {
      const queryBuilder = this.repo
        .createQueryBuilder('kp')
        .where('kp.name = :name', { name })
        .andWhere('kp.isActive = :isActive', { isActive: true });

      if (currentParentId) {
        queryBuilder.andWhere('kp.parentId = :parentId', {
          parentId: currentParentId,
        });
      } else {
        queryBuilder.andWhere('kp.parentId IS NULL');
      }

      const node = await queryBuilder.getOne();
      if (!node) {
        return null;
      }

      currentParentId = node.id;
    }

    if (!currentParentId) {
      return null;
    }

    return this.repo.findOne({ where: { id: currentParentId } });
  }
}

