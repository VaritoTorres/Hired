/**
 * @file competence-map.component.ts
 * @description "Mapa de Competencias" — Professional concept-level weakness
 * dashboard.  Replaces the Ranking placeholder.
 *
 * Displays per-concept performance grouped by technology, with
 * weakness classification (Dominado / Inestable / Débil), learning
 * stagnation flags, and cognitive-level tagging.
 *
 * All data flows read-only from the `get_competence_map` Supabase RPC
 * (installed in migration 005).  No mutations happen from this component.
 */
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { RouterModule }     from '@angular/router';
import { WeaknessService }  from '../../core/services/weakness.service';
import {
  CompetenceMapItem,
  TechnologyConceptGroup,
  WEAKNESS_META,
  WeaknessClass,
  CognitiveLevel,
  COGNITIVE_LEVEL_LABELS,
} from '../../shared/models/concept.model';

type FilterChoice = WeaknessClass | 'all' | 'stagnating';

interface FilterTab {
  value:  FilterChoice;
  label:  string;
  emoji?: string;
}

const FILTER_TABS: FilterTab[] = [
  { value: 'all',        label: 'Todos' },
  { value: 'debil',      label: 'Débil',     emoji: '🔴' },
  { value: 'inestable',  label: 'Inestable', emoji: '🟡' },
  { value: 'dominado',   label: 'Dominado',  emoji: '🟢' },
  { value: 'stagnating', label: 'Estancado', emoji: '⚠️' },
];

@Component({
  selector:    'app-competence-map',
  standalone:  true,
  imports:     [CommonModule, RouterModule],
  templateUrl: './competence-map.component.html',
  styleUrls:   ['./competence-map.component.css'],
})
export class CompetenceMapComponent implements OnInit {
  private readonly weaknessSvc = inject(WeaknessService);

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);

  private readonly allItems = signal<CompetenceMapItem[]>([]);

  readonly activeFilter = signal<FilterChoice>('all');
  readonly filterTabs   = FILTER_TABS;

  // ─── Derived state ─────────────────────────────────────────────────────────
  readonly totalConcepts = computed(() => this.allItems().length);
  readonly weakCount     = computed(() => this.allItems().filter((i) => i.weakness_class === 'debil').length);
  readonly unstableCount = computed(() => this.allItems().filter((i) => i.weakness_class === 'inestable').length);
  readonly dominatedCount= computed(() => this.allItems().filter((i) => i.weakness_class === 'dominado').length);
  readonly stagnatingCount = computed(() => this.allItems().filter((i) => i.learning_stagnation).length);

  readonly groups = computed<TechnologyConceptGroup[]>(() =>
    this.weaknessSvc.groupByTechnology(this.allItems(), this.activeFilter())
  );

  readonly stagnatingItems = computed<CompetenceMapItem[]>(() =>
    this.allItems().filter((i) => i.learning_stagnation)
  );

  readonly hasData = computed(() => this.allItems().length > 0);

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.weaknessSvc.getCompetenceMap().subscribe({
      next: (items) => {
        this.allItems.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Error inesperado');
        this.loading.set(false);
      },
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  setFilter(filter: FilterChoice): void {
    this.activeFilter.set(filter);
  }

  // ─── Template helpers ───────────────────────────────────────────────────────
  getWeaknessMeta(cls: WeaknessClass) {
    return WEAKNESS_META[cls];
  }

  getCognitiveLevelLabel(level: CognitiveLevel | null): string {
    if (!level) return '—';
    return COGNITIVE_LEVEL_LABELS[level];
  }

  formatAccuracy(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  /** Percentage-width for the weakness-index progress bar (inverse: high index = wide red bar) */
  weaknessBarWidth(index: number): string {
    return `${Math.round(index * 100)}%`;
  }

  /** CSS color for the weakness bar fill */
  weaknessBarColor(cls: WeaknessClass): string {
    return WEAKNESS_META[cls].color;
  }

  filterTabCount(tab: FilterTab): number {
    const items = this.allItems();
    if (tab.value === 'all')        return items.length;
    if (tab.value === 'stagnating') return items.filter((i) => i.learning_stagnation).length;
    return items.filter((i) => i.weakness_class === tab.value).length;
  }

  trackByConceptId(_: number, item: CompetenceMapItem): string { return item.concept_id; }
  trackByGroupId(_: number, g: TechnologyConceptGroup): string { return g.technology_id; }
}
