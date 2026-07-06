{{- define "synthetic-users.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "synthetic-users.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "synthetic-users.labels" -}}
app.kubernetes.io/name: {{ include "synthetic-users.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "synthetic-users.selectorLabels" -}}
app.kubernetes.io/name: {{ include "synthetic-users.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
