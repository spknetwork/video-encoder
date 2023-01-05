import moment from 'moment'
import { GatewayService } from '../gateway.service'

export class ScoringService {
  gateway: GatewayService

  constructor(gatewayService: GatewayService) {
    this.gateway = gatewayService
  }

  async nodeScore(node_id) {
    const jobActivity = await this.gateway.activity.activity.distinct('job_id', {
      assigned_to: node_id,
      previous_status: { $in: ['assigned', 'running', 'uploading'] },
      status: 'queued',
      date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
    })

    const jobs = await this.gateway.activity.activity.distinct('job_id', {
      assigned_to: node_id,
      date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
    })

    const list = await this.gateway.jobs
      .find({
        status: 'complete',
        assigned_to: node_id,
        assigned_date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
        completed_at: { $exists: true },
        'input.size': { $exists: true },
      })
      .toArray()
    let sumArray = []
    let weightedSum = 0
    let timeSum = 0
    list.map((e) => {
      if (e.completed_at && e.input.size) {
        sumArray.push(((e.completed_at - e.assigned_date) / 1000).toFixed())
        weightedSum = weightedSum + e.input.size / ((e.completed_at - e.assigned_date) / 1000)
        timeSum = timeSum + (e.completed_at - e.assigned_date)
      }
    })

    return {
      node_id,
      //jobActivity,
      //jobs,
      byte_rate: Number((weightedSum / list.length).toFixed()),
      jobs_reassigned: jobActivity.length,
      jobs_total: jobs.length,
      reassign_rate: Number((jobActivity.length / jobs.length).toFixed(4)),
      low_precision: jobs.length < 15,
    }
  }

  async scoreMap() {
    const assignedList = (await this.gateway.activity.activity.distinct('assigned_to')).filter(
      (e) => !!e,
    )

    let scoreMap: Record<string, number> = {}
    let testOut = []
    let aggregate_byte_rate = 0
    for (let node_id of assignedList) {
      const jobActivity = await this.gateway.activity.activity.distinct('job_id', {
        assigned_to: node_id,
        previous_status: { $in: ['assigned', 'running', 'uploading'] },
        status: 'queued',
        date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
      })

      const jobs = await this.gateway.activity.activity.distinct('job_id', {
        assigned_to: node_id,
        date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
      })

      const list = await this.gateway.jobs
        .find({
          status: 'complete',
          assigned_to: node_id,
          assigned_date: { $gt: new Date(moment().subtract(7, 'day').toISOString()) },
          completed_at: { $exists: true },
          'input.size': { $exists: true },
        })
        .toArray()
      let sumArray = []
      let weightedSum = 0
      let timeSum = 0
      list.map((e) => {
        if (e.completed_at && e.input.size) {
          sumArray.push(((e.completed_at - e.assigned_date) / 1000).toFixed())
          weightedSum = weightedSum + e.input.size / ((e.completed_at - e.assigned_date) / 1000)
          timeSum = timeSum + (e.completed_at - e.assigned_date)
        }
      })

      const loadCount = await this.gateway.jobs.countDocuments({
        status: { $in: ['assigned', 'running'] },
        assigned_to: node_id,
      })

      const byte_rate = Number((weightedSum / list.length).toFixed()) || 0
      aggregate_byte_rate = aggregate_byte_rate + byte_rate
      testOut.push({
        node_id,
        //jobActivity,
        //jobs,
        byte_rate,
        jobs_reassigned: jobActivity.length,
        jobs_total: jobs.length,
        reassign_rate: Number((jobActivity.length / jobs.length).toFixed(4)),
        low_precision: jobs.length < 15,
        load: loadCount,
      })
    }
    return testOut.map((e) => {
      e.byte_rate_share = e.byte_rate / aggregate_byte_rate
      return e
    })
  }

  /**
   * Current amount of load the cluster is under
   * Can allocate more jobs to non-primary nodes
   */
  async currentLoad() {}

  /**
   * Creates an allocation of jobs based upon load and node rank
   *
   */
  async createAllocation() {}

  /**
   * Most active nodes over designated time period.
   */
  async activeNodes() {}
}
