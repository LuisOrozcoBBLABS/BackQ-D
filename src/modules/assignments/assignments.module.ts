import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  // Para reusar el predicado de alcance de proyectos al crear una asignacion,
  // en vez de copiarlo acá y que las dos versiones se desincronicen.
  imports: [ProjectsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
