import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { EntregaPendiente, EstadoSincronizacion, StorageService } from './services/storage.service';
import { Tarea, TareaService } from './services/tarea.service';

// Define las vistas principales de la aplicación para navegar entre secciones.
type Vista = 'tareas' | 'entregas' | 'perfil' | 'ajustes';
// Define el rol de la interfaz para cambiar el comportamiento entre estudiante e instructor.
type Rol = 'estudiante' | 'instructor';

// Información básica para mostrar cursos y cuántas tareas pendientes tiene cada uno.
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
  // Servicio para consumir la lista de tareas desde el JSON del proyecto.
  private readonly tareaService = inject(TareaService);
  // Servicio que guarda, lista y elimina entregas en IndexedDB.
  private readonly storageService = inject(StorageService);
  // Identificador de plataforma para saber si estamos en navegador o servidor.
  private readonly platformId = inject(PLATFORM_ID);
  // Verifica si la app está ejecutándose en el navegador.
  private readonly browser = isPlatformBrowser(this.platformId);
  // Referencia al input de archivo para poder limpiar el valor después de guardar.
  @ViewChild('attachmentInput') private attachmentInput?: ElementRef<HTMLInputElement>;

  // Estado actual de conexión del navegador.
  online = this.browser ? navigator.onLine : true;
  // Lista completa de tareas cargadas desde el JSON.
  tareas: Tarea[] = [];
  // Entregas guardadas localmente en IndexedDB.
  entregas: EntregaPendiente[] = [];
  // Datos estáticos de cursos del instructor para la vista de cursos.
  readonly cursosInstructor: CursoInstructor[] = [
    { nombre: 'Software PWA', pendientes: 15 },
    { nombre: 'Desarrollo PWA', pendientes: 15 },
    { nombre: 'Base de Datos Avanzada', pendientes: 17 },
    { nombre: 'IA Aplicada', pendientes: 10 }
  ];
  // Rol actual de la vista de la interfaz.
  rol: Rol = 'estudiante';
  // ID de la tarea seleccionada por el estudiante.
  tareaSeleccionadaId: number | null = null;
  // Curso elegido por el instructor para una observación.
  cursoSeleccionado = '';
  // Nombre de la tarea que el instructor registra.
  tituloObservacion = '';
  // Texto del comentario o avance de la entrega.
  comentario = '';
  // Nombre visible del archivo adjunto.
  archivoNombre = '';
  // Texto usado para buscar tareas por coincidencia.
  busquedaTarea = '';
  // Filtro por curso activo en la lista de tareas.
  cursoFiltro = 'todos';
  // Mensaje general que se muestra al usuario en la UI.
  mensaje = '';
  // Tipo del mensaje para cambiar el estilo visual: éxito, advertencia o error.
  tipoMensaje: 'success' | 'warning' | 'error' | '' = '';
  // Indica si la carga de tareas aún está en progreso.
  cargandoTareas = true;
  // Evita que el usuario pulse varias veces el botón de guardar.
  guardando = false;
  // Vista activa de la navegación inferior.
  vistaActiva: Vista = 'tareas';

  // Se ejecuta al crear el componente. Registra eventos de conexión y carga inicial.
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

  // Actualiza la bandera online/offline cada vez que cambia el estado de conexión.
  private readonly actualizarEstadoConexion = (): void => {
    this.online = this.browser && navigator.onLine;
  };

  // Devuelve la tarea actualmente seleccionada para el formulario de entrega.
  get tareaSeleccionada(): Tarea | undefined {
    return this.tareas.find((tarea) => tarea.id === this.tareaSeleccionadaId);
  }

  // Obtiene los nombres únicos de cursos para el select de filtros.
  get cursosDisponibles(): string[] {
    return [...new Set(this.tareas.map((tarea) => tarea.curso))];
  }

  // Aplica búsqueda y filtro por curso a la lista visible del estudiante.
  get tareasEstudiante(): Tarea[] {
    const query = this.busquedaTarea.trim().toLowerCase();

    return this.tareas.filter((tarea) => {
      const coincideBusqueda = !query ||
        tarea.titulo.toLowerCase().includes(query) ||
        tarea.curso.toLowerCase().includes(query);
      const coincideCurso = this.cursoFiltro === 'todos' || tarea.curso === this.cursoFiltro;
      return coincideBusqueda && coincideCurso;
    });
  }

  get entregasPendientes(): EntregaPendiente[] {
    return this.entregas.filter((entrega) => entrega.estadoSincronizacion === 'PENDIENTE');
  }

  // Permite cambiar entre la vista de estudiante e instructor.
  alternarRol(): void {
    this.rol = this.rol === 'estudiante' ? 'instructor' : 'estudiante';
    this.mensaje = '';
    this.tipoMensaje = '';
  }

  // Cambia la pestaña activa de la navegación principal.
  seleccionarVista(vista: Vista): void {
    this.vistaActiva = vista;
    if (vista === 'entregas') {
      void this.cargarEntregasLocales();
    }
  }

  // Reinicia los filtros de búsqueda de tareas.
  limpiarFiltros(): void {
    this.busquedaTarea = '';
    this.cursoFiltro = 'todos';
  }

  // Guarda la entrega del estudiante en IndexedDB y evita envíos vacíos.
  enviarEntrega(): void {
    if (this.guardando) return;

    if (this.rol === 'instructor') {
      void this.guardarObservacionLocal();
      return;
    }

    const tarea = this.tareaSeleccionada;
    if (!tarea) {
      this.mostrarMensaje('Selecciona una tarea antes de guardar la entrega.', 'error');
      return;
    }

    const comentarioValido = this.comentario.trim();
    if (!comentarioValido && !this.archivoNombre) {
      this.mostrarMensaje('Agrega un comentario o adjunta un archivo para continuar.', 'error');
      return;
    }

    const entregaLocal = {
      tareaId: tarea.id,
      curso: tarea.curso,
      tituloTarea: tarea.titulo,
      instructor: tarea.instructor,
      comentario: comentarioValido,
      archivoNombre: this.archivoNombre,
      ...(this.attachmentInput?.nativeElement.files?.[0]
        ? { archivo: this.attachmentInput.nativeElement.files[0] }
        : {})
    };

    this.guardando = true;
    void this.storageService.guardarEntregaLocal(entregaLocal)
      .then(() => {
        this.mostrarMensaje(
          this.online
            ? 'Con conexión: se registró la entrega localmente con estado PENDIENTE. Sin una API real, no se marca como sincronizada.'
            : 'Sin conexión: entrega guardada en el dispositivo. Estado: PENDIENTE',
          this.online ? 'warning' : 'warning'
        );
        this.limpiarFormularioEstudiante();
        return this.cargarEntregasLocales();
      })
      .catch((error: unknown) => {
        console.error('Error al guardar la entrega local.', error);
        this.mostrarMensaje('No se pudo guardar la entrega en este dispositivo.', 'error');
      })
      .finally(() => {
        this.guardando = false;
      });
  }

  // Elimina una entrega guardada solo después de confirmar la acción.
  async eliminarEntrega(id: number): Promise<void> {
    const entrega = this.entregas.find((item) => item.id === id);
    if (!entrega) {
      return;
    }

    const confirmado = this.browser ? window.confirm(`¿Deseas eliminar la entrega de "${entrega.tituloTarea}"?`) : true;
    if (!confirmado) {
      return;
    }

    try {
      await this.storageService.eliminarEntregaLocal(id);
      this.mostrarMensaje('Entrega eliminada correctamente.', 'success');
      await this.cargarEntregasLocales();
    } catch (error) {
      console.error('Error al eliminar la entrega local.', error);
      this.mostrarMensaje('No se pudo eliminar la entrega de este dispositivo.', 'error');
    }
  }

  // Formatea la fecha para mostrarla en un estilo amigable al estudiante.
  formatearFecha(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short'
    }).format(new Date(`${fecha}T12:00:00`));
  }

  // Muestra la fecha y hora con formato legible en la bandeja local.
  formatearFechaHora(fecha: string): string {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(fecha));
  }

  // Traduce el estado interno a texto legible para la interfaz.
  getEstadoLabel(estado: EstadoSincronizacion): string {
    return estado === 'PENDIENTE' ? 'Pendiente' : estado === 'SINCRONIZADO' ? 'Sincronizado' : 'Error';
  }

  // Carga la lista inicial de tareas desde el servicio HTTP.
  private cargarTareas(): void {
    this.tareaService.obtenerTareas()
      .pipe(finalize(() => this.cargandoTareas = false))
      .subscribe({
        next: (tareas) => {
          this.tareas = tareas;
          if (!this.tareaSeleccionadaId && tareas.length > 0) {
            this.tareaSeleccionadaId = tareas[0].id;
          }
          if (this.cursoFiltro !== 'todos' && !this.cursosDisponibles.includes(this.cursoFiltro)) {
            this.cursoFiltro = 'todos';
          }
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

  // Lee todas las entregas persistidas en IndexedDB para mostrarlas en la bandeja.
  private async cargarEntregasLocales(): Promise<void> {
    try {
      this.entregas = await this.storageService.listarEntregasLocales();
    } catch (error) {
      console.error('No se pudieron cargar las entregas locales.', error);
      this.mostrarMensaje('No se pudieron leer las entregas guardadas en este dispositivo.', 'error');
    }
  }

  // Guarda una observación del instructor en la misma base local de pendientes.
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
        archivoNombre: '',
        estadoSincronizacion: 'PENDIENTE',
        intentosSincronizacion: 0
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

  // Captura el nombre del archivo adjunto para mostrarlo en la vista del formulario.
  seleccionarArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivoNombre = input.files?.[0]?.name ?? '';
  }

  // Muestra un mensaje global para informar al usuario del resultado de la operación.
  private mostrarMensaje(mensaje: string, tipo: 'success' | 'warning' | 'error'): void {
    this.mensaje = mensaje;
    this.tipoMensaje = tipo;
  }

  // Limpia el formulario del estudiante después de guardar la entrega.
  private limpiarFormularioEstudiante(): void {
    this.comentario = '';
    this.archivoNombre = '';
    if (this.attachmentInput) {
      this.attachmentInput.nativeElement.value = '';
    }
  }
}
