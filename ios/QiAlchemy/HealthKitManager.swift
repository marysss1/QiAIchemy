import Foundation
import HealthKit
import React

@objc(HealthKitManager)
class HealthKitManager: NSObject {
  private let healthStore = HKHealthStore()
  private let lock = NSLock()

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func isHealthDataAvailable(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(HKHealthStore.isHealthDataAvailable())
  }

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve(false)
      return
    }

    let readTypes = buildReadTypes()
    if readTypes.isEmpty {
      resolve(false)
      return
    }

    healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
      if let error {
        reject("healthkit_auth_error", error.localizedDescription, error)
        return
      }
      resolve(success)
    }
  }

  @objc
  func getHealthSnapshot(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([
        "authorized": false,
        "generatedAt": Self.isoString(from: Date()),
        "note": "HealthKit unavailable on current device",
      ])
      return
    }

    let dispatchGroup = DispatchGroup()
    var queryError: Error?
    var sections: [String: [String: Any]] = [
      "activity": [:],
      "sleep": [:],
      "heart": [:],
      "oxygen": [:],
      "metabolic": [:],
      "environment": [:],
      "body": [:],
    ]
    var workouts: [[String: Any]] = []
    var notes: [String] = []

    func setErrorIfNeeded(_ error: Error?) {
      guard let error else {
        return
      }
      if self.isNoDataError(error) {
        return
      }
      self.lock.lock()
      if queryError == nil {
        queryError = error
      }
      self.lock.unlock()
    }

    func appendNote(_ note: String) {
      self.lock.lock()
      notes.append(note)
      self.lock.unlock()
    }

    func setSectionValue(section: String, key: String, value: Double?) {
      guard let value else {
        return
      }
      guard value.isFinite else {
        return
      }
      self.lock.lock()
      var dict = sections[section] ?? [:]
      dict[key] = Self.round(value)
      sections[section] = dict
      self.lock.unlock()
    }

    func mergeSection(section: String, values: [String: Any]?) {
      guard let values else {
        return
      }
      self.lock.lock()
      var dict = sections[section] ?? [:]
      values.forEach { key, raw in
        guard Self.isBridgeSafeValue(raw) else {
          return
        }
        dict[key] = raw
      }
      sections[section] = dict
      self.lock.unlock()
    }

    func runLatestQuantity(
      _ identifier: HKQuantityTypeIdentifier,
      unit: HKUnit,
      section: String,
      key: String,
      transform: ((Double) -> Double)? = nil
    ) {
      dispatchGroup.enter()
      queryLatestQuantity(identifier: identifier, unit: unit) { value, error in
        setErrorIfNeeded(error)
        if let value {
          let output = transform?(value) ?? value
          setSectionValue(section: section, key: key, value: output)
        }
        dispatchGroup.leave()
      }
    }

    func runTodayCumulative(
      _ identifier: HKQuantityTypeIdentifier,
      unit: HKUnit,
      section: String,
      key: String
    ) {
      dispatchGroup.enter()
      queryTodayCumulative(identifier: identifier, unit: unit) { value, error in
        setErrorIfNeeded(error)
        setSectionValue(section: section, key: key, value: value)
        dispatchGroup.leave()
      }
    }

    runTodayCumulative(.stepCount, unit: HKUnit.count(), section: "activity", key: "stepsToday")
    runTodayCumulative(
      .distanceWalkingRunning,
      unit: HKUnit.meterUnit(with: .kilo),
      section: "activity",
      key: "distanceWalkingRunningKmToday"
    )
    runTodayCumulative(
      .activeEnergyBurned,
      unit: HKUnit.kilocalorie(),
      section: "activity",
      key: "activeEnergyKcalToday"
    )
    runTodayCumulative(
      .basalEnergyBurned,
      unit: HKUnit.kilocalorie(),
      section: "activity",
      key: "basalEnergyKcalToday"
    )
    runTodayCumulative(
      .flightsClimbed,
      unit: HKUnit.count(),
      section: "activity",
      key: "flightsClimbedToday"
    )
    runTodayCumulative(
      .appleExerciseTime,
      unit: HKUnit.minute(),
      section: "activity",
      key: "exerciseMinutesToday"
    )

    dispatchGroup.enter()
    queryStandHoursToday { value, error in
      setErrorIfNeeded(error)
      setSectionValue(section: "activity", key: "standHoursToday", value: value)
      dispatchGroup.leave()
    }

    if #available(iOS 9.3, *) {
      dispatchGroup.enter()
      queryTodayActivityGoals { summary, error in
        setErrorIfNeeded(error)
        if let summary {
          mergeSection(section: "activity", values: summary)
        } else {
          appendNote("activitySummary goals unavailable, using client fallback goals")
        }
        dispatchGroup.leave()
      }
    }

    if #available(iOS 17.0, *) {
      runTodayCumulative(
        .timeInDaylight,
        unit: HKUnit.minute(),
        section: "environment",
        key: "daylightMinutesToday"
      )
    } else {
      appendNote("timeInDaylight requires iOS 17+")
    }

    dispatchGroup.enter()
    querySleepSummaryLast36Hours { summary, error in
      setErrorIfNeeded(error)
      mergeSection(section: "sleep", values: summary)
      dispatchGroup.leave()
    }

    if #available(iOS 18.0, *) {
      dispatchGroup.enter()
      querySleepApneaSummaryLast30Days { summary, error in
        setErrorIfNeeded(error)
        mergeSection(section: "sleep", values: summary)
        dispatchGroup.leave()
      }
    } else {
      appendNote("sleepApneaEvent requires iOS 18+")
    }

    runLatestQuantity(
      .heartRate,
      unit: HKUnit.count().unitDivided(by: HKUnit.minute()),
      section: "heart",
      key: "latestHeartRateBpm"
    )
    runLatestQuantity(
      .restingHeartRate,
      unit: HKUnit.count().unitDivided(by: HKUnit.minute()),
      section: "heart",
      key: "restingHeartRateBpm"
    )
    runLatestQuantity(
      .walkingHeartRateAverage,
      unit: HKUnit.count().unitDivided(by: HKUnit.minute()),
      section: "heart",
      key: "walkingHeartRateAverageBpm"
    )
    runLatestQuantity(
      .heartRateVariabilitySDNN,
      unit: HKUnit.secondUnit(with: .milli),
      section: "heart",
      key: "heartRateVariabilityMs"
    )
    runLatestQuantity(
      .vo2Max,
      unit: HKUnit(from: "ml/(kg*min)"),
      section: "heart",
      key: "vo2MaxMlKgMin"
    )
    runLatestQuantity(
      .bloodPressureSystolic,
      unit: HKUnit.millimeterOfMercury(),
      section: "heart",
      key: "systolicBloodPressureMmhg"
    )
    runLatestQuantity(
      .bloodPressureDiastolic,
      unit: HKUnit.millimeterOfMercury(),
      section: "heart",
      key: "diastolicBloodPressureMmhg"
    )

    if #available(iOS 16.0, *) {
      runLatestQuantity(
        .atrialFibrillationBurden,
        unit: HKUnit.percent(),
        section: "heart",
        key: "atrialFibrillationBurdenPercent"
      ) { raw in
        raw <= 1 ? raw * 100 : raw
      }
    } else {
      appendNote("atrialFibrillationBurden requires iOS 16+")
    }

    runLatestQuantity(
      .oxygenSaturation,
      unit: HKUnit.percent(),
      section: "oxygen",
      key: "bloodOxygenPercent"
    ) { raw in
      raw <= 1 ? raw * 100 : raw
    }

    let bloodGlucoseUnit = HKUnit.gramUnit(with: .milli)
      .unitDivided(by: HKUnit.literUnit(with: .deci))
    runLatestQuantity(
      .bloodGlucose,
      unit: bloodGlucoseUnit,
      section: "metabolic",
      key: "bloodGlucoseMgDl"
    )

    runLatestQuantity(
      .respiratoryRate,
      unit: HKUnit.count().unitDivided(by: HKUnit.minute()),
      section: "body",
      key: "respiratoryRateBrpm"
    )
    runLatestQuantity(
      .bodyTemperature,
      unit: HKUnit.degreeCelsius(),
      section: "body",
      key: "bodyTemperatureCelsius"
    )
    runLatestQuantity(
      .bodyMass,
      unit: HKUnit.gramUnit(with: .kilo),
      section: "body",
      key: "bodyMassKg"
    )

    dispatchGroup.enter()
    queryRecentWorkouts(days: 30, limit: 40) { records, error in
      setErrorIfNeeded(error)
      if let records {
        self.lock.lock()
        workouts = records
        self.lock.unlock()
      }
      dispatchGroup.leave()
    }

    dispatchGroup.notify(queue: .main) {
      if let queryError {
        reject("healthkit_query_error", queryError.localizedDescription, queryError)
        return
      }

      var payload: [String: Any] = [
        "authorized": true,
        "generatedAt": Self.isoString(from: Date()),
        "workouts": workouts,
      ]

      sections.forEach { section, values in
        if !values.isEmpty {
          payload[section] = values
        }
      }

      if !notes.isEmpty {
        payload["note"] = notes.joined(separator: "; ")
      }

      resolve(payload)
    }
  }

  private func buildReadTypes() -> Set<HKObjectType> {
    var readTypes: Set<HKObjectType> = [HKObjectType.workoutType()]

    if #available(iOS 9.3, *) {
      readTypes.insert(HKObjectType.activitySummaryType())
    }

    let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
      .stepCount,
      .distanceWalkingRunning,
      .activeEnergyBurned,
      .basalEnergyBurned,
      .flightsClimbed,
      .appleExerciseTime,
      .heartRate,
      .restingHeartRate,
      .walkingHeartRateAverage,
      .heartRateVariabilitySDNN,
      .vo2Max,
      .oxygenSaturation,
      .bloodGlucose,
      .bloodPressureSystolic,
      .bloodPressureDiastolic,
      .respiratoryRate,
      .bodyTemperature,
      .bodyMass,
    ]

    quantityIdentifiers.forEach { identifier in
      if let type = HKObjectType.quantityType(forIdentifier: identifier) {
        readTypes.insert(type)
      }
    }

    if #available(iOS 16.0, *) {
      if let afib = HKObjectType.quantityType(forIdentifier: .atrialFibrillationBurden) {
        readTypes.insert(afib)
      }
    }

    if #available(iOS 17.0, *) {
      if let daylight = HKObjectType.quantityType(forIdentifier: .timeInDaylight) {
        readTypes.insert(daylight)
      }
    }

    var categoryIdentifiers: [HKCategoryTypeIdentifier] = [
      .sleepAnalysis,
      .appleStandHour,
    ]

    if #available(iOS 18.0, *) {
      categoryIdentifiers.append(
        HKCategoryTypeIdentifier(rawValue: "HKCategoryTypeIdentifierSleepApneaEvent")
      )
    }

    categoryIdentifiers.forEach { identifier in
      if let type = HKObjectType.categoryType(forIdentifier: identifier) {
        readTypes.insert(type)
      }
    }

    return readTypes
  }

  private func queryLatestQuantity(
    identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion(nil, nil)
      return
    }

    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
    let query = HKSampleQuery(
      sampleType: quantityType,
      predicate: nil,
      limit: 1,
      sortDescriptors: [sort]
    ) { _, samples, error in
      if let error {
        completion(nil, error)
        return
      }
      guard let sample = samples?.first as? HKQuantitySample else {
        completion(nil, nil)
        return
      }
      completion(sample.quantity.doubleValue(for: unit), nil)
    }

    healthStore.execute(query)
  }

  private func queryTodayCumulative(
    identifier: HKQuantityTypeIdentifier,
    unit: HKUnit,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else {
      completion(nil, nil)
      return
    }

    let now = Date()
    let startOfDay = Calendar.current.startOfDay(for: now)
    let predicate = HKQuery.predicateForSamples(
      withStart: startOfDay,
      end: now,
      options: .strictStartDate
    )

    let query = HKStatisticsQuery(
      quantityType: quantityType,
      quantitySamplePredicate: predicate,
      options: .cumulativeSum
    ) { _, result, error in
      if let error {
        completion(nil, error)
        return
      }
      let sum = result?.sumQuantity()?.doubleValue(for: unit)
      completion(sum, nil)
    }

    healthStore.execute(query)
  }

  private func queryStandHoursToday(completion: @escaping (Double?, Error?) -> Void) {
    guard let type = HKObjectType.categoryType(forIdentifier: .appleStandHour) else {
      completion(nil, nil)
      return
    }

    let now = Date()
    let startOfDay = Calendar.current.startOfDay(for: now)
    let predicate = HKQuery.predicateForSamples(
      withStart: startOfDay,
      end: now,
      options: .strictStartDate
    )

    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: HKObjectQueryNoLimit,
      sortDescriptors: nil
    ) { _, samples, error in
      if let error {
        completion(nil, error)
        return
      }

      let stoodValue = HKCategoryValueAppleStandHour.stood.rawValue
      let stoodHours = samples?
        .compactMap { $0 as? HKCategorySample }
        .filter { $0.value == stoodValue }
        .count ?? 0

      completion(Double(stoodHours), nil)
    }

    healthStore.execute(query)
  }

  private func querySleepSummaryLast36Hours(completion: @escaping ([String: Any]?, Error?) -> Void) {
    guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      completion(nil, nil)
      return
    }

    let now = Date()
    guard let start = Calendar.current.date(byAdding: .hour, value: -36, to: now) else {
      completion(nil, nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(
      withStart: start,
      end: now,
      options: []
    )

    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: HKObjectQueryNoLimit,
      sortDescriptors: nil
    ) { _, samples, error in
      if let error {
        completion(nil, error)
        return
      }

      let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
      if let summary = self.buildSleepSummary(
        from: categorySamples,
        windowStart: start,
        windowEnd: now,
        scoreSource: "today"
      ) {
        completion(summary, nil)
        return
      }

      self.queryMostRecentSleepSummaryFallback(
        type: type,
        lookbackDays: 365,
        completion: completion
      )
    }

    healthStore.execute(query)
  }

  private func queryMostRecentSleepSummaryFallback(
    type: HKCategoryType,
    lookbackDays: Int,
    completion: @escaping ([String: Any]?, Error?) -> Void
  ) {
    let now = Date()
    guard let start = Calendar.current.date(byAdding: .day, value: -lookbackDays, to: now) else {
      completion(nil, nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(
      withStart: start,
      end: now,
      options: []
    )
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: HKObjectQueryNoLimit,
      sortDescriptors: [sort]
    ) { _, samples, error in
      if let error {
        completion(nil, error)
        return
      }

      let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
      let clusters = self.clusterSleepSamples(categorySamples)

      for cluster in clusters.reversed() {
        guard
          let windowStart = cluster.first?.startDate,
          let windowEnd = cluster.last?.endDate
        else {
          continue
        }

        if let summary = self.buildSleepSummary(
          from: cluster,
          windowStart: windowStart,
          windowEnd: windowEnd,
          scoreSource: "latestAvailable"
        ) {
          completion(summary, nil)
          return
        }
      }

      completion(nil, nil)
    }

    healthStore.execute(query)
  }

  private func clusterSleepSamples(_ samples: [HKCategorySample]) -> [[HKCategorySample]] {
    guard !samples.isEmpty else {
      return []
    }

    let sorted = samples.sorted { lhs, rhs in
      if lhs.startDate == rhs.startDate {
        return lhs.endDate < rhs.endDate
      }
      return lhs.startDate < rhs.startDate
    }

    let maxGap: TimeInterval = 2 * 60 * 60
    var clusters: [[HKCategorySample]] = []
    var currentCluster: [HKCategorySample] = []

    for sample in sorted {
      guard let last = currentCluster.last else {
        currentCluster.append(sample)
        continue
      }

      let gap = sample.startDate.timeIntervalSince(last.endDate)
      if gap <= maxGap {
        currentCluster.append(sample)
      } else {
        if !currentCluster.isEmpty {
          clusters.append(currentCluster)
        }
        currentCluster = [sample]
      }
    }

    if !currentCluster.isEmpty {
      clusters.append(currentCluster)
    }

    return clusters
  }

  private func buildSleepSummary(
    from categorySamples: [HKCategorySample],
    windowStart: Date,
    windowEnd: Date,
    scoreSource: String
  ) -> [String: Any]? {
    guard !categorySamples.isEmpty else {
      return nil
    }

    var inBed: TimeInterval = 0
    var asleep: TimeInterval = 0
    var awake: TimeInterval = 0

    var stageDurations: [String: TimeInterval] = [
      "inBed": 0,
      "asleepUnspecified": 0,
      "awake": 0,
      "asleepCore": 0,
      "asleepDeep": 0,
      "asleepREM": 0,
    ]

    categorySamples.forEach { sample in
      let duration = sample.endDate.timeIntervalSince(sample.startDate)
      guard duration > 0 else {
        return
      }

      if self.isSleepInBed(sample.value) {
        inBed += duration
      } else if self.isSleepAsleep(sample.value) {
        asleep += duration
      } else if self.isSleepAwake(sample.value) {
        awake += duration
      }

      let stage = self.sleepStageName(sample.value)
      if stageDurations[stage] != nil {
        stageDurations[stage, default: 0] += duration
      }
    }

    let asleepMinutes = asleep / 60
    if asleepMinutes <= 0 {
      return nil
    }

    let awakeMinutes = awake / 60
    let deepMinutes = (stageDurations["asleepDeep"] ?? 0) / 60
    let remMinutes = (stageDurations["asleepREM"] ?? 0) / 60
    let sleepScore = self.estimateSleepScore(
      asleepMinutes: asleepMinutes,
      awakeMinutes: awakeMinutes,
      deepMinutes: deepMinutes,
      remMinutes: remMinutes
    )

    let stageMinutes: [String: Any] = [
      "inBedMinutes": Self.round((stageDurations["inBed"] ?? 0) / 60),
      "asleepUnspecifiedMinutes": Self.round((stageDurations["asleepUnspecified"] ?? 0) / 60),
      "awakeMinutes": Self.round((stageDurations["awake"] ?? 0) / 60),
      "asleepCoreMinutes": Self.round((stageDurations["asleepCore"] ?? 0) / 60),
      "asleepDeepMinutes": Self.round((stageDurations["asleepDeep"] ?? 0) / 60),
      "asleepREMMinutes": Self.round((stageDurations["asleepREM"] ?? 0) / 60),
    ]

    let sleepSamples = categorySamples
      .sorted { $0.startDate < $1.startDate }
      .map { sample -> [String: Any] in
        let source = sample.sourceRevision.source
        return [
          "value": sample.value,
          "stage": self.sleepStageName(sample.value),
          "startDate": Self.isoString(from: sample.startDate),
          "endDate": Self.isoString(from: sample.endDate),
          "sourceName": source.name,
          "sourceBundleId": source.bundleIdentifier,
        ]
      }

    return [
      "inBedMinutesLast36h": Self.round(inBed / 60),
      "asleepMinutesLast36h": Self.round(asleepMinutes),
      "awakeMinutesLast36h": Self.round(awakeMinutes),
      "sampleCountLast36h": categorySamples.count,
      "sleepScore": sleepScore,
      "sleepScoreSource": scoreSource,
      "sleepScoreWindowStart": Self.isoString(from: windowStart),
      "sleepScoreWindowEnd": Self.isoString(from: windowEnd),
      "sleepScoreFallbackUsed": scoreSource != "today",
      "stageMinutesLast36h": stageMinutes,
      "samplesLast36h": sleepSamples,
    ]
  }

  private func estimateSleepScore(
    asleepMinutes: Double,
    awakeMinutes: Double,
    deepMinutes: Double,
    remMinutes: Double
  ) -> Int {
    let qualityBase = 95.0
      - abs(asleepMinutes - 450.0) * 0.08
      - awakeMinutes * 0.45
      + deepMinutes * 0.03
      + remMinutes * 0.02

    let clamped = min(max(qualityBase, 45.0), 98.0)
    return Int(Darwin.round(clamped))
  }

  private func queryTodayActivityGoals(completion: @escaping ([String: Any]?, Error?) -> Void) {
    if #available(iOS 9.3, *) {
      let calendar = Calendar.current
      let startDate = calendar.startOfDay(for: Date())
      guard let endDate = calendar.date(byAdding: .day, value: 1, to: startDate) else {
        completion(nil, nil)
        return
      }
      var startComponents = calendar.dateComponents([.year, .month, .day], from: startDate)
      var endComponents = calendar.dateComponents([.year, .month, .day], from: endDate)
      startComponents.calendar = calendar
      endComponents.calendar = calendar
      let predicate = HKQuery.predicate(
        forActivitySummariesBetweenStart: startComponents,
        end: endComponents
      )

      let query = HKActivitySummaryQuery(predicate: predicate) { _, summaries, error in
        if let error {
          completion(nil, error)
          return
        }

        guard let summary = summaries?.first else {
          completion(nil, nil)
          return
        }

        let moveGoal = summary.activeEnergyBurnedGoal.doubleValue(for: HKUnit.kilocalorie())
        let exerciseGoal = summary.appleExerciseTimeGoal.doubleValue(for: HKUnit.minute())
        let standGoal = summary.appleStandHoursGoal.doubleValue(for: HKUnit.count())

        completion(
          [
            "activeEnergyGoalKcal": Self.round(moveGoal),
            "exerciseGoalMinutes": Self.round(exerciseGoal),
            "standGoalHours": Self.round(standGoal),
          ],
          nil
        )
      }

      healthStore.execute(query)
    } else {
      completion(nil, nil)
    }
  }

  private func querySleepApneaSummaryLast30Days(completion: @escaping ([String: Any]?, Error?) -> Void) {
    if #available(iOS 18.0, *) {
      let apneaIdentifier = HKCategoryTypeIdentifier(
        rawValue: "HKCategoryTypeIdentifierSleepApneaEvent"
      )
      guard let type = HKObjectType.categoryType(forIdentifier: apneaIdentifier) else {
        completion(nil, nil)
        return
      }

      let now = Date()
      guard let start = Calendar.current.date(byAdding: .day, value: -30, to: now) else {
        completion(nil, nil)
        return
      }

      let predicate = HKQuery.predicateForSamples(
        withStart: start,
        end: now,
        options: .strictStartDate
      )
      let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
      let query = HKSampleQuery(
        sampleType: type,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, samples, error in
        if let error {
          completion(nil, error)
          return
        }

        let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
        let eventCount = categorySamples.count
        let totalMinutes = categorySamples.reduce(0.0) { partial, sample in
          partial + max(sample.endDate.timeIntervalSince(sample.startDate), 0) / 60.0
        }
        let riskLevel = self.apneaRiskLevel(eventCount: eventCount, totalMinutes: totalMinutes)

        var apnea: [String: Any] = [
          "eventCountLast30d": eventCount,
          "durationMinutesLast30d": Self.round(totalMinutes),
          "riskLevel": riskLevel,
          "reminder": self.apneaReminderText(riskLevel: riskLevel, eventCount: eventCount),
        ]
        if let latest = categorySamples.first?.endDate {
          apnea["latestEventAt"] = Self.isoString(from: latest)
        }

        completion([
          "apnea": apnea,
        ], nil)
      }

      healthStore.execute(query)
    } else {
      completion(nil, nil)
    }
  }

  private func queryRecentWorkouts(
    days: Int,
    limit: Int,
    completion: @escaping ([[String: Any]]?, Error?) -> Void
  ) {
    let type = HKObjectType.workoutType()
    let now = Date()
    guard let start = Calendar.current.date(byAdding: .day, value: -days, to: now) else {
      completion(nil, nil)
      return
    }

    let predicate = HKQuery.predicateForSamples(
      withStart: start,
      end: now,
      options: .strictStartDate
    )
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    let query = HKSampleQuery(
      sampleType: type,
      predicate: predicate,
      limit: limit,
      sortDescriptors: [sort]
    ) { _, samples, error in
      if let error {
        completion(nil, error)
        return
      }

      let records = (samples ?? []).compactMap { $0 as? HKWorkout }.map { workout in
        var record: [String: Any] = [
          "activityTypeCode": workout.workoutActivityType.rawValue,
          "activityTypeName": self.workoutTypeName(workout.workoutActivityType),
          "startDate": Self.isoString(from: workout.startDate),
          "endDate": Self.isoString(from: workout.endDate),
          "durationMinutes": Self.round(workout.duration / 60),
        ]

        if let totalEnergy = workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()) {
          record["totalEnergyKcal"] = Self.round(totalEnergy)
        }
        if let distance = workout.totalDistance?.doubleValue(for: HKUnit.meterUnit(with: .kilo)) {
          record["totalDistanceKm"] = Self.round(distance)
        }

        return record
      }

      completion(records, nil)
    }

    healthStore.execute(query)
  }

  private func isSleepInBed(_ value: Int) -> Bool {
    value == HKCategoryValueSleepAnalysis.inBed.rawValue
  }

  private func isSleepAsleep(_ value: Int) -> Bool {
    if #available(iOS 16.0, *) {
      return value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepCore.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepREM.rawValue
    } else {
      return value == HKCategoryValueSleepAnalysis.asleep.rawValue
    }
  }

  private func isSleepAwake(_ value: Int) -> Bool {
    if #available(iOS 16.0, *) {
      return value == HKCategoryValueSleepAnalysis.awake.rawValue
    }
    return false
  }

  private func sleepStageName(_ value: Int) -> String {
    if value == HKCategoryValueSleepAnalysis.inBed.rawValue {
      return "inBed"
    }

    if #available(iOS 16.0, *) {
      switch value {
      case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
        return "asleepUnspecified"
      case HKCategoryValueSleepAnalysis.awake.rawValue:
        return "awake"
      case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
        return "asleepCore"
      case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
        return "asleepDeep"
      case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
        return "asleepREM"
      default:
        return "unknown"
      }
    }

    if value == HKCategoryValueSleepAnalysis.asleep.rawValue {
      return "asleepUnspecified"
    }

    return "unknown"
  }

  private func apneaRiskLevel(eventCount: Int, totalMinutes: Double) -> String {
    if eventCount == 0 {
      return "none"
    }
    if eventCount <= 2 && totalMinutes < 20 {
      return "watch"
    }
    return "high"
  }

  private func apneaReminderText(riskLevel: String, eventCount: Int) -> String {
    switch riskLevel {
    case "none":
      return "近30天未检测到睡眠呼吸暂停事件；若有打鼾、晨起头痛或白天嗜睡，建议持续观察。"
    case "watch":
      return "近30天检测到 \(eventCount) 次睡眠呼吸暂停事件，建议规律作息并持续追踪。"
    default:
      return "近30天检测到 \(eventCount) 次睡眠呼吸暂停事件，建议到睡眠专科进一步评估。"
    }
  }

  private func workoutTypeName(_ type: HKWorkoutActivityType) -> String {
    switch type {
    case .walking:
      return "walk"
    case .running:
      return "run"
    case .cycling:
      return "cycle"
    case .swimming:
      return "swim"
    case .yoga:
      return "yoga"
    case .traditionalStrengthTraining:
      return "strength"
    case .highIntensityIntervalTraining:
      return "hiit"
    case .hiking:
      return "hike"
    default:
      return "activity_\(type.rawValue)"
    }
  }

  private static func round(_ value: Double, digits: Int = 2) -> Double {
    guard value.isFinite else {
      return 0
    }
    let factor = pow(10.0, Double(digits))
    return Darwin.round(value * factor) / factor
  }

  private static func isBridgeSafeValue(_ value: Any) -> Bool {
    if let number = value as? NSNumber {
      if CFGetTypeID(number) == CFBooleanGetTypeID() {
        return true
      }
      return number.doubleValue.isFinite
    }
    if let doubleValue = value as? Double {
      return doubleValue.isFinite
    }
    if let floatValue = value as? Float {
      return floatValue.isFinite
    }
    return true
  }

  private static func isoString(from date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  private func isNoDataError(_ error: Error) -> Bool {
    let nsError = error as NSError
    if nsError.domain == HKErrorDomain, nsError.code == HKError.Code.errorNoData.rawValue {
      return true
    }

    let message = nsError.localizedDescription.lowercased()
    if message.contains("no data available for the specified predicate") {
      return true
    }

    return false
  }
}
