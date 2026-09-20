<script setup lang="ts">
import { computed } from "vue";
import type { Project, Tag, Task, TaskScope } from "../types";
import TagActions from "./TagActions.vue";

const props = defineProps<{
  projects: Project[];
  tags: Tag[];
  tasks: Task[];
  scope: TaskScope;
  trashCount: number;
}>();

const emit = defineEmits<{
  select: [scope: TaskScope];
  createProject: [];
  editProject: [project: Project];
  deleteTag: [tag: Tag];
}>();

const activeProjects = computed(() => props.projects.filter((project) => project.status === "active"));
const archivedProjects = computed(() => props.projects.filter((project) => project.status === "archived"));

function isSelected(kind: TaskScope["kind"], id?: string) {
  return props.scope.kind === kind && (id === undefined || ("id" in props.scope && props.scope.id === id));
}

function taskCount(projectId: string | null) {
  return props.tasks.filter((task) => task.columnId !== "done" && task.projectId === projectId).length;
}

function tagCount(tagId: string) {
  return props.tasks.filter(
    (task) => task.columnId !== "done" && task.tags.some((tag) => tag.id === tagId),
  ).length;
}

function tagUsageCount(tagId: string) {
  return props.tasks.filter((task) => task.tags.some((tag) => tag.id === tagId)).length;
}

</script>

<template>
  <nav class="workspace-nav" aria-label="任务范围">
    <div class="workspace-nav__primary">
      <button
        class="workspace-nav__row"
        :class="{ 'workspace-nav__row--selected': isSelected('all') }"
        type="button"
        @click="emit('select', { kind: 'all' })"
      >
        <span class="workspace-nav__all-mark" aria-hidden="true" />
        <span>全部任务</span>
        <small>{{ tasks.filter((task) => task.columnId !== 'done').length }}</small>
      </button>
      <button
        class="workspace-nav__row"
        :class="{ 'workspace-nav__row--selected': isSelected('unassigned') }"
        type="button"
        @click="emit('select', { kind: 'unassigned' })"
      >
        <span class="workspace-nav__empty-mark" aria-hidden="true">—</span>
        <span>无项目</span>
        <small>{{ taskCount(null) }}</small>
      </button>
      <button
        class="workspace-nav__row workspace-nav__trash"
        :class="{ 'workspace-nav__row--selected': isSelected('trash') }"
        type="button"
        @click="emit('select', { kind: 'trash' })"
      >
        <svg viewBox="0 0 18 18" aria-hidden="true">
          <path d="M3.5 5h11M7 3.5h4M5.7 5l.5 9.5h5.6l.5-9.5M7.6 7.5v4.3M10.4 7.5v4.3" />
        </svg>
        <span>回收站</span>
        <small>{{ trashCount }}</small>
      </button>
    </div>

    <section class="workspace-nav__section" aria-labelledby="projects-heading">
      <header>
        <h2 id="projects-heading">项目</h2>
        <button type="button" aria-label="新建项目" @click="emit('createProject')">＋</button>
      </header>
      <div v-if="!activeProjects.length" class="workspace-nav__empty">还没有项目</div>
      <div v-for="project in activeProjects" :key="project.id" class="workspace-nav__item">
        <button
          class="workspace-nav__row"
          :class="{ 'workspace-nav__row--selected': isSelected('project', project.id) }"
          type="button"
          @click="emit('select', { kind: 'project', id: project.id })"
        >
          <span class="project-dot" :style="{ backgroundColor: project.color }" aria-hidden="true" />
          <span>{{ project.name }}</span>
          <small>{{ taskCount(project.id) }}</small>
        </button>
        <button
          class="workspace-nav__edit"
          type="button"
          :aria-label="`编辑项目：${project.name}`"
          @click="emit('editProject', project)"
        >
          ···
        </button>
      </div>
      <details v-if="archivedProjects.length" class="workspace-nav__archived">
        <summary>已归档项目 · {{ archivedProjects.length }}</summary>
        <div v-for="project in archivedProjects" :key="project.id" class="workspace-nav__item">
          <button
            class="workspace-nav__row"
            :class="{ 'workspace-nav__row--selected': isSelected('project', project.id) }"
            type="button"
            @click="emit('select', { kind: 'project', id: project.id })"
          >
            <span class="project-dot" :style="{ backgroundColor: project.color }" aria-hidden="true" />
            <span>{{ project.name }}</span>
            <small>{{ taskCount(project.id) }}</small>
          </button>
          <button
            class="workspace-nav__edit"
            type="button"
            :aria-label="`编辑项目：${project.name}`"
            @click="emit('editProject', project)"
          >
            ···
          </button>
        </div>
      </details>
    </section>

    <section v-if="tags.length" class="workspace-nav__section workspace-nav__tags" aria-labelledby="tags-heading">
      <header><h2 id="tags-heading">标签</h2></header>
      <div
        v-for="tag in tags"
        :key="tag.id"
        class="workspace-nav__item workspace-nav__tag-item"
      >
        <button
          class="workspace-nav__row"
          :class="{ 'workspace-nav__row--selected': isSelected('tag', tag.id) }"
          type="button"
          @click="emit('select', { kind: 'tag', id: tag.id })"
        >
          <span class="workspace-nav__tag-mark" aria-hidden="true">#</span>
          <span>{{ tag.name }}</span>
          <small>{{ tagCount(tag.id) }}</small>
        </button>
        <TagActions :tag="tag" :usage-count="tagUsageCount(tag.id)" @delete="emit('deleteTag', $event)" />
      </div>
    </section>
  </nav>
</template>
