import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CreateGroupDto,
  QueryGroupsDto,
  SetMembersDto,
  UpdateGroupDto,
} from './dto/group.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista los grupos con sus integrantes.' })
  findAll(@Query() q: QueryGroupsDto) {
    return this.groups.findAll(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un grupo.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.findOne(id);
  }

  @Post()
  @RequirePermission('groups.manage')
  @ApiOperation({ summary: 'Crea un grupo.' })
  create(@Body() dto: CreateGroupDto) {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @RequirePermission('groups.manage')
  @ApiOperation({ summary: 'Edita nombre y lema.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGroupDto) {
    return this.groups.update(id, dto);
  }

  @Put(':id/members')
  @RequirePermission('groups.manage')
  @ApiOperation({ summary: 'Reemplaza la lista de integrantes.' })
  setMembers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetMembersDto) {
    return this.groups.setMembers(id, dto);
  }

  @Patch(':id/disable')
  @RequirePermission('groups.manage')
  @ApiOperation({ summary: 'Archiva el grupo y deja a sus integrantes sin grupo.' })
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.setActivo(id, false);
  }

  @Patch(':id/enable')
  @RequirePermission('groups.manage')
  @ApiOperation({ summary: 'Reactiva un grupo archivado.' })
  enable(@Param('id', ParseUUIDPipe) id: string) {
    return this.groups.setActivo(id, true);
  }
}
