import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestUser } from '../../common/types/request-user';
import { CreateProjectDto, SaveAiResultDto, UpdateProjectDto } from './dto/project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista proyectos según el alcance del usuario.' })
  findAll(@Query() q: QueryProjectsDto, @CurrentUser() user: RequestUser) {
    return this.projects.findAll(q, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un proyecto.' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.projects.findOne(id, user);
  }

  @Post()
  @RequirePermission('projects.create')
  @ApiOperation({ summary: 'Registra una idea o proyecto de innovación.' })
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: RequestUser) {
    return this.projects.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un proyecto. Solo el autor o un administrador.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projects.update(id, dto, user);
  }

  @Patch(':id/ai')
  @RequirePermission('ai.use')
  @ApiOperation({ summary: 'Guarda enriquecimiento y score del motor de IA.' })
  saveAi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveAiResultDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projects.saveAiResult(id, dto, user);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archiva el proyecto. No lo borra.' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.projects.setArchivado(id, true, user);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restaura un proyecto archivado.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.projects.setArchivado(id, false, user);
  }
}
