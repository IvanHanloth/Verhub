import { compact, type HttpClient } from "./http"
import type {
  ActionRecordItem,
  AnnouncementItem,
  AnnouncementListResponse,
  CheckUpdateOptions,
  CheckUpdateResponse,
  CreateActionRecordInput,
  CreateFeedbackInput,
  FeedbackItem,
  ListAnnouncementsOptions,
  LogItem,
  PageOptions,
  Platform,
  ProjectItem,
  UploadLogInput,
  VersionItem,
  VersionListResponse,
} from "./models"

/**
 * 公开接口，不需要凭据。
 *
 * 这些是客户端 App 会直接调用的那一组：查版本、查公告、报日志和行为。全部作用于
 * 客户端绑定的项目（构造时传入的 `projectKey`），因此方法不再逐次收项目参数。
 */
export class PublicApi {
  /**
   * @param http 底层 HTTP 客户端
   */
  constructor(private readonly http: HttpClient) {}

  getProject(): Promise<ProjectItem> {
    return this.http.request("GET", "/public/{projectKey}", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @param options 分页参数
   */
  listVersions(options: PageOptions = {}): Promise<VersionListResponse> {
    return this.http.request("GET", "/public/{projectKey}/versions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset },
    })
  }

  getLatestVersion(): Promise<VersionItem> {
    return this.http.request("GET", "/public/{projectKey}/versions/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @returns 最新 preview 版本；没有则为 null
   */
  getLatestPreviewVersion(): Promise<VersionItem | null> {
    return this.http.request("GET", "/public/{projectKey}/versions/latest-preview", {
      pathParams: { projectKey: this.http.requireProjectKey() },
    })
  }

  /**
   * @param version 版本号，如 `1.2.0`
   */
  getVersion(version: string): Promise<VersionItem> {
    return this.http.request("GET", "/public/{projectKey}/versions/by-version/{version}", {
      pathParams: { projectKey: this.http.requireProjectKey(), version },
    })
  }

  /**
   * 提交当前版本并检查更新。
   *
   * `current_version` 与 `current_comparable_version` 至少提供一个。只给
   * `current_version` 时服务端按版本号查库取其登记的可比较版本号，该版本未
   * 登记会返回 400；两者都给时以 `current_comparable_version` 为准。
   *
   * @param options 当前版本与比较选项
   */
  checkUpdate(options: CheckUpdateOptions): Promise<CheckUpdateResponse> {
    return this.http.request("POST", "/public/{projectKey}/versions/check-update", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...options }),
    })
  }

  /**
   * @param options 分页与平台筛选
   */
  listAnnouncements(options: ListAnnouncementsOptions = {}): Promise<AnnouncementListResponse> {
    return this.http.request("GET", "/public/{projectKey}/announcements", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { limit: options.limit, offset: options.offset, platform: options.platform },
    })
  }

  /**
   * @param options 平台筛选
   */
  getLatestAnnouncement(options: { platform?: Platform } = {}): Promise<AnnouncementItem> {
    return this.http.request("GET", "/public/{projectKey}/announcements/latest", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      query: { platform: options.platform },
    })
  }

  /**
   * @param input 反馈内容与可选的评分、平台、自定义数据
   */
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackItem> {
    return this.http.request("POST", "/public/{projectKey}/feedbacks", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
    })
  }

  /**
   * @param input 日志等级、内容与可选的设备信息
   */
  uploadLog(input: UploadLogInput): Promise<LogItem> {
    return this.http.request("POST", "/public/{projectKey}/logs", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
    })
  }

  /**
   * @param input 行为定义 ID 与自定义数据
   */
  createActionRecord(input: CreateActionRecordInput): Promise<ActionRecordItem> {
    return this.http.request("POST", "/public/{projectKey}/actions", {
      pathParams: { projectKey: this.http.requireProjectKey() },
      body: compact({ ...input }),
    })
  }
}
