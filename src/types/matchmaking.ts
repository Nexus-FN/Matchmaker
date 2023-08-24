export enum RoleEnum {
	Owner = "OWNER",
	Dev = "DEVELOPER",
	Mod = "MODERATOR",
	Helper = "HELPER",
	T3 = "T3_USER",
	T2 = "T2_USER",
	T1 = "T1_USER",
	User = "USER",
	Banned = "BANNED",
}

type Platform = "Windows" | "Mac";

export interface MatchmakingPayload {
	playerId: string;
	partyPlayerIds: string[];
	bucketId: string;
	attributes: {
		"player.subregions": string;
		"player.role": RoleEnum;
		"player.option.partyId": string;
		"player.userAgent": string;
		"player.platform": Platform;
		"player.option.linkType": string;
		"player.preferredSubregion": string; //DE, GB, FR, etc
		"player.input": string; //KBM etc
		"playlist.revision": number;
		"player.option.customKey"?: string;
		"player.option.fillTeam": boolean;
		"player.option.linkCode": string;
		"player.option.uiLanguage": string;
		"player.privateMMS": boolean;
		"player.option.spectator": boolean;
		"player.inputTypes": string;
		"player.option.groupBy": string; //Mnemonic, same as linkCode
		"player.option.microphoneEnabled": boolean;
	};
	expireAt: string;
	nonce: string;
}
