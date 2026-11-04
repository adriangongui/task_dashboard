-- Nueva columna "Mañana": las tareas con este tipo se pasan a "hoy"
-- automáticamente en el cierre del día.
alter type tipo_tarea add value if not exists 'manana';
