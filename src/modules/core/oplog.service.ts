import { Collection } from "mongodb";
import { CoreService } from "./core.service";

interface Activity {

    job_id: string
    previous_status: string
    status: string

    duration: number
    date: Date

    assigned_to: string;

    state: any
}

export class ActivityService {
    self: CoreService
    activity: Collection<Activity>;
    constructor(self) {
        this.self = self;

        this.activity = this.self.gateway.db.collection<Activity>('activity')
    }

    async changeState(args: {
        job_id: string
        new_status: string
        state?: any
        meta?: any
        assigned_to: string
    }) {
        const date = new Date()
        const action = await this.activity.findOne({
            job_id: args.job_id
        }, {
            sort: {
                date: -1
            }
        })

        let duration
        if(action) {
            duration = date.getTime() - action.date.getTime()
        } else {
            duration = null
        }

        const new_op = {
            job_id: args.job_id,
            previous_status: action.status,
            status: args.new_status,

            duration,
            date,

            state: args.state,
            assigned_to: args.assigned_to
        }
        await this.activity.insertOne(new_op)
    }
}