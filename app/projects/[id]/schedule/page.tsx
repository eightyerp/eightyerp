import Link from "next/link";
import { notFound } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProcessSchedulesWorkspace from "@/components/schedules/ProcessSchedulesWorkspace";
import { isMissingRelationError } from "@/lib/crm/errors";
import { listProcessSchedules } from "@/lib/crm/process-schedules";
import { getProjectById } from "@/lib/crm/projects";
import {
  getScheduleAccess,
  listEmployeesInScope,
  listTeams,
} from "@/lib/crm/schedule-access";
import { createClient } from "@/lib/supabase-server";
import type { Employee, ProjectProcessSchedule, Team } from "@/types/database";

const MIGRATION_HINT =
  "supabase/migrations/20260725000001_customer_and_process_schedules.sql 을 Supabase SQL Editor에서 실행해 주세요.";

async function isScheduleSchemaMissing(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("project_process_schedules").select("id").limit(1);
    if (!error) return false;
    return isMissingRelationError(new Error(error.message));
  } catch {
    return false;
  }
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
};

export default async function ProjectSchedulePage({ params, searchParams }: Props) {
  const { id: projectId } = await params;
  const query = await searchParams;
  const project = await getProjectById(projectId).catch(() => null);
  if (!project || project.deleted_at) notFound();

  const access = await getScheduleAccess();

  let schedules: ProjectProcessSchedule[] = [];
  let employees: Employee[] = [];
  let teams: Team[] = [];
  let loadError: string | null = null;
  let tablesMissing = false;

  try {
    employees = await listEmployeesInScope(access);
  } catch {
    employees = [];
  }

  try {
    teams = await listTeams();
  } catch {
    teams = [];
  }

  try {
    schedules = await listProcessSchedules({ projectId }, access);
  } catch (error) {
    tablesMissing = await isScheduleSchemaMissing();
    loadError = error instanceof Error ? error.message : "공정 일정을 불러오지 못했습니다.";
  }

  const openCreate = query.new === "1";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400">{project.name} · 공사 스케줄</p>
            <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">현장 공사 스케줄</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/projects/${projectId}/schedule?new=1`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              공사 일정 등록
            </Link>
            <Link
              href={`/customers/${project.customer_id}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              고객 상세로 돌아가기
            </Link>
          </div>
        </div>

        {tablesMissing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="font-semibold">공사 스케줄 테이블을 찾을 수 없습니다.</p>
            <p className="mt-2">{MIGRATION_HINT}</p>
          </div>
        )}

        {loadError && !tablesMissing && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && (
          <ProcessSchedulesWorkspace
            initialSchedules={schedules}
            employees={employees}
            teams={teams}
            projects={[
              {
                id: project.id,
                name: project.name,
                customer_id: project.customer_id,
                address: project.address,
                construction_start_at: project.construction_start_at ?? null,
              },
            ]}
            access={{
              canViewAll: access.canViewAll,
              canViewTeam: access.canViewTeam,
              employeeId: access.employeeId,
              role: access.role,
            }}
            fixedProjectId={projectId}
            initialCreateOpen={openCreate}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
