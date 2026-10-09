import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Tarea {
  id: number;
  curso: string;
  titulo: string;
  instructor: string;
  fechaEntrega: string;
  estado: string;
}

@Injectable({ providedIn: 'root' })
export class TareaService {
  private readonly http = inject(HttpClient);

  obtenerTareas(): Observable<Tarea[]> {
    return this.http.get<Tarea[]>('/assets/data/tareas.json');
  }
}
