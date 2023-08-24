import { RoleEnum } from "../types/matchmaking.js";

const roleHierarchy = {
	[RoleEnum.Owner]: 0,
	[RoleEnum.Dev]: 1,
	[RoleEnum.Mod]: 2,
	[RoleEnum.T3]: 3,
	[RoleEnum.T2]: 4,
	[RoleEnum.T1]: 5,
	[RoleEnum.Helper]: 6,
	[RoleEnum.User]: 7,
	[RoleEnum.Banned]: 8,
};

export function roleCheck(userRole: RoleEnum, role: RoleEnum): boolean {
	return roleHierarchy[userRole] <= roleHierarchy[role];
}
