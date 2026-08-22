export declare const TASKMAP_COD_RANKING_POLICY_VERSION: "taskmap-work-control-policy.2";
export declare const TASKMAP_COD_RANKING_POLICY_V2: Readonly<{
    readonly contractVersion: "taskmap-work-control-policy.2";
    readonly scoreScale: "integer_basis_points";
    readonly rounding: "nearest_integer_half_up";
    readonly formula: "cost_of_delay_divided_by_sqrt_effort";
    readonly scoreCapBasisPoints: 10000;
    readonly effortFloor: 1;
    readonly bodyBonusCapBasisPoints: 800;
    readonly bodyBonusByGrade: Readonly<{
        readonly C2_ATTRIBUTION_CANDIDATE: 300;
        readonly C3_CAUSAL_HYPOTHESIS: 500;
        readonly C4_VALIDATED_PATTERN: 800;
    }>;
    readonly tieBreak: "score_desc_then_code_point_task_id";
}>;
export declare const TASKMAP_COD_RANKING_POLICY_DIGEST: string;
export type TaskMapCodRankReasonCode = "cost_of_delay" | "effort_damping" | "body_context_not_causal";
export interface TaskMapCodScoreInput {
    taskId: string;
    costOfDelayBasisPoints: number;
    effort: number;
    bodyBonusBasisPoints: number;
}
export interface TaskMapCodScoreRow {
    taskId: string;
    scoreBasisPoints: number;
    /**
     * Additive accounting invariant:
     * scoreBasisPoints = costOfDelay - effortDamping + bodyBonus.
     */
    contributionBasisPoints: {
        costOfDelay: number;
        effortDamping: number;
        bodyBonus: number;
    };
    reasonCodes: TaskMapCodRankReasonCode[];
}
export interface TaskMapCodComparableRankRow {
    taskId: string;
    scoreBasisPoints: number;
}
export declare function scoreTaskMapCodTask(input: TaskMapCodScoreInput): TaskMapCodScoreRow;
export declare function compareTaskMapCodRankRows(left: TaskMapCodComparableRankRow, right: TaskMapCodComparableRankRow): number;
