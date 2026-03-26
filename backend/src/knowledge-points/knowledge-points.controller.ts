import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { KnowledgePointsService } from './knowledge-points.service';
import { CreateKnowledgePointDto } from './dto/create-knowledge-point.dto';
import { UpdateKnowledgePointDto } from './dto/update-knowledge-point.dto';
import { QueryKnowledgePointsDto } from './dto/query-knowledge-points.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { SeedKnowledgePointsService } from './seeds/seed-knowledge-points.service';

@UseGuards(JwtAuthGuard)
@Controller('knowledge-points')
export class KnowledgePointsController {
  constructor(
    private readonly knowledgePointsService: KnowledgePointsService,
    private readonly seedService: SeedKnowledgePointsService,
  ) {}

  /**
   * 创建知识点
   */
  @Post()
  create(
    @Body() dto: CreateKnowledgePointDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.knowledgePointsService.create(dto, user.userId);
  }

  /**
   * 批量创建知识点
   */
  @Post('bulk')
  bulkCreate(
    @Body() body: { items: CreateKnowledgePointDto[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.knowledgePointsService.bulkCreate(body.items, user.userId);
  }

  /**
   * 获取知识点树
   */
  @Get('tree')
  getTree(@Query('subjectCode') subjectCode?: string) {
    return this.knowledgePointsService.getTree(subjectCode);
  }

  /**
   * 获取指定节点的子树
   */
  @Get(':id/descendants-tree')
  getDescendantsTree(@Param('id') id: string) {
    return this.knowledgePointsService.getDescendantsTree(id);
  }

  /**
   * 获取知识点路径（面包屑）
   */
  @Get(':id/path')
  getPath(@Param('id') id: string) {
    return this.knowledgePointsService.getPath(id);
  }

  /**
   * 查询知识点列表
   */
  @Get()
  findAll(@Query() query: QueryKnowledgePointsDto) {
    return this.knowledgePointsService.findAll(query);
  }

  /**
   * 获取单个知识点
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.knowledgePointsService.findOne(id);
  }

  /**
   * 更新知识点
   */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgePointDto) {
    return this.knowledgePointsService.update(id, dto);
  }

  /**
   * 删除知识点（软删除）
   */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgePointsService.remove(id);
  }

  /**
   * 初始化默认知识点（种子数据）
   */
  @Post('seed')
  async initializeSeed() {
    await this.seedService.seed();
    return { message: '知识点初始化成功' };
  }
}

