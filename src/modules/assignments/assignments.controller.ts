import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestUser } from '../../common/types/request-user';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, QueryAssignmentsDto, UpdateEstadoDto } from './dto/assignment.dto';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista asignaciones. Por defecto solo las propias.' })
  findAll(@Query() q: QueryAssignmentsDto, @CurrentUser() user: RequestUser) {
    return this.assignments.findAll(q, user);
  }

  @Post()
  @RequirePermission('assignments.create')
  @ApiOperation({ summary: 'Asigna un proyecto con prioridad y canales de aviso.' })
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: RequestUser) {
    return this.assignments.create(dto, user);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Mueve el estado de la asignación.' })
  updateEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assignments.updateEstado(id, dto.estado, user);
  }
}
