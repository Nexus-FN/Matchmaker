import { IncomingMessage } from "http";

class SkiddedVersion {
    public getVersionInfo(req: IncomingMessage) {
        const memory = {
            season: 0,
            build: 0.0,
            CL: "0",
            lobby: "",
        };

        if (req.headers["user-agent"]) {
            let cL = "";

            try {
                let buildID = req.headers["user-agent"].split("-")[3].split(",")[0];

                if (!Number.isNaN(Number(buildID))) cL = buildID;
                else {
                    buildID = req.headers["user-agent"].split("-")[3].split(" ")[0];

                    if (!Number.isNaN(Number(buildID))) cL = buildID;
                }
            } catch {
                try {
                    const BuildID = req.headers["user-agent"].split("-")[1].split("+")[0];

                    if (!Number.isNaN(Number(BuildID))) cL = BuildID;
                } catch { }
            }

            try {
                let build = req.headers["user-agent"].split("Release-")[1].split("-")[0];

                if (build.split(".").length === 3) {
                    const Value = build.split(".");
                    build = `${Value[0]}.${Value[1]}.${Value[2]}`;
                }

                memory.season = Number(build.split(".")[0]);
                memory.build = Number(build);
                memory.CL = cL;
                memory.lobby = `LobbySeason${memory.season}`;

                if (Number.isNaN(memory.season)) throw new Error();
            } catch (e) {
                if (Number.isNaN(memory.CL)) {
                    memory.season = 0;
                    memory.build = 0.0;
                    memory.CL = cL;
                    memory.lobby = "LobbySeason0";
                } else if (Number(memory.CL) < 3724489) {
                    memory.season = 0;
                    memory.build = 0.0;
                    memory.CL = cL;
                    memory.lobby = "LobbySeason0";
                } else if (Number(memory.CL) <= 3790078) {
                    memory.season = 1;
                    memory.build = 1.0;
                    memory.CL = cL;
                    memory.lobby = "LobbySeason1";
                } else {
                    memory.season = 2;
                    memory.build = 2.0;
                    memory.CL = cL;
                    memory.lobby = "LobbyWinterDecor";
                }
            }
        }

        return memory;
    }
}

export default new SkiddedVersion();
