import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { EntregaPendiente, StorageService } from './services/storage.service';
import { Tarea, TareaService } from './services/tarea.service';

type Vista = 'tareas' | 'entregas' | 'perfil' | 'ajustes';
type Rol = 'estudiante' | 'instructor';

interface CursoInstructor {
  nombre: string;
  pendientes: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly tareaService = inject(TareaService);
  private readonly storageService = inject(StorageService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly browser = isPlatformBrowser(this.platformId);
  @ViewChild('attachmentInput') private attachmentInput?: ElementRef<HTMLInputElement>;

  online = this.browser ? navigator.onLine : true;
  tareas: Tarea[] = [];
  entregas: EntregaPendiente[] = [];
  readonly cursosInstructor: CursoInstructor[] = [
    { nombre: 'Software PWA', pendientes: 15 },
    { nombre: 'Desarrollo PWA', pendientes: 15 },
    { nombre: 'Base de Datos Avanzada', pendientes: 17 },
    { nombre: 'IA Aplicada', pendientes: 10 }
  ];
  rol: Rol = 'estudiante';
  tareaSeleccionadaId: number | null = null;
  cursoSeleccionado = '';
  tituloObservacion = '';
  comentario = '';
  archivoNombre = '';
  mensaje = '';
  tipoMensaje: 'success' | 'warning' | 'error' | '' = '';
  cargandoTareas = true;
  guardando = false;
  vistaActiva: Vista = 'tareas';

  ngOnInit(): void {
    if (this.browser) {
      window.addEventListener('online', this.actualizarEstadoConexion);
      window.addEventListener('offline', this.actualizarEstadoConexion);
    }
    this.cargarTareas();
    void this.cargarEntregasLocales();
  }

  ngOnDestroy(): void {
    if (this.browser) {
      window.removeEventListener('online', this.actualizarEstadoConexion);
      window.removeEventListener('offline', this.actualizarEstadoConexion);
    }
  }

  private readonly actualizarEstadoConexion = (): void => {
    this.online = this.browser && navigator.onLine;
  };

  get tareaSeleccionada(): Tarea | undefined {
    return this.tareas.find((tarea) => tarea.id === this.tareaSeleccionadaId);
  }

  get tareasEstudiante(): Tarea[] {
    return this.tareas.slice(0, 3);
  }

  alternarRol(): void {
    this.rol = this.rol === 'estudiante' ? 'instructor' : 'estudiante';
    this.mensaje = '';
    this.tipoMensaje = '';
  }

  seleccionarVista(vista: Vista): void {
    this.vistaActiva = vista;
    if (vista === 'entregas') {
      void this.cargarEntregasLocales();
    }
  }

  enviarEntrega(): void {
    if (this.guardando) return;

    if (this.rol === 'instructor') {
      void this.guardarObservacionLocal();
      return;
    }

    const tarea = this.tareaSeleccionada;
    if (!tarea) {
      this.mostrarMensaje('Selecciona una tarea antes de enviar la entrega.', 'error');
      return;
    }

    if (!this.comentario.trim() && !this.archivoNombre) {
      this.mostrarMensaje('Agrega un comentario o adjunta un archivo para continuar.', 'error');
      return;
    }

    if (this.online) {
      this.mostrarMensaje(
        'Entrega enviada exitosamente al servidor del Campus Virtual.',
        'success'
      );
      this.limpiarFormularioEstudiante();
      return;
    }

    this.guardando = true;
    void this.storageService.guardarEntregaLocal({
      tareaId: tarea.id,
      curso: tarea.curso,
      tituloTarea: tarea.titulo,
      instructor: tarea.instructor,
      comentario: this.comentario.trim(),
      archivoNombre: this.archivoNombre,
      ...(this.attachmentInput?.nativeElement.files?.[0]
        ? { archivo: this.attachmentInput.nativeElement.files[0] }
        : {})
    }).then(() => {
      this.mostrarMensaje(
        'Sin Conexión: Entrega guardada en el dispositivo. Estado: PENDIENTE',
        'warning'
      );
      this.limpiarFormularioEstudiante();
      return this.cargarEntregasLocales();
    }).catch((error: unknown) => {
      console.error('Error al guardar la entrega offline.', error);
      this.mostrarMensaje('No se pudo guardar la entrega en este dispositivo.', 'error');
    }).finally(() => {
      this.guardando = false;
    });
  }

  private async guardarObservacionLocal(): Promise<void> {
    const curso = this.cursoSeleccionado;
    const titulo = this.tituloObservacion.trim();
    const observaciones = this.comentario.trim();

    if (!curso || !titulo || !observaciones) {
      this.mostrarMensaje('Completa el curso, el nombre de la tarea y las observaciones.', 'error');
      return;
    }

    this.guardando = true;
    try {
      await this.storageService.guardarEntregaLocal({
        curso,
        tituloTarea: titulo,
        comentario: observaciones,
        archivoNombre: ''
      });
      this.mostrarMensaje(
        'Observación guardada en el dispositivo. Se sincronizará al recuperar conexión.',
        'warning'
      );
      this.tituloObservacion = '';
      this.comentario = '';
      await this.cargarEntregasLocales();
    } catch (error) {
      console.error('Error al guardar la observación local.', error);
      this.mostrarMensaje('No se pudo guardar la observación en este dispositivo.', 'error');
    } finally {
      this.guardando = false;
    }
  }

  seleccionarArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoNombre = input.files?.[0]?.name ?? '';
  }

  formatearFecha(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short'
    }).format(new Date(`${fecha}T12:00:00`));
  }

  private cargarTareas(): void {
    this.tareaService.obtenerTareas()
      .pipe(finalize(() => this.cargandoTareas = false))
      .subscribe({
        next: (tareas) => {
          this.tareas = tareas;
          this.tareaSeleccionadaId = tareas[0]?.id ?? null;
        },
        error: (error: unknown) => {
          console.error('No se pudieron cargar las tareas.', error);
          this.mostrarMensaje(
            'No se pudieron cargar las tareas. Conéctate para volver a intentarlo.',
            'error'
          );
        }
      });
  }

  private async cargarEntregasLocales(): Promise<void> {
    try {
      this.entregas = await this.storageService.listarEntregasLocales();
    } catch (error) {
      console.error('No se pudieron cargar las entregas locales.', error);
      this.mostrarMensaje('No se pudieron leer las entregas guardadas en este dispositivo.', 'error');
    }
  }

  private mostrarMensaje(mensaje: string, tipo: 'success' | 'warning' | 'error'): void {
    this.mensaje = mensaje;
    this.tipoMensaje = tipo;
  }

  private limpiarFormularioEstudiante(): void {
    this.comentario = '';
    this.archivoNombre = '';
    if (this.attachmentInput) {
      this.attachmentInput.nativeElement.value = '';
    }
  }
}
