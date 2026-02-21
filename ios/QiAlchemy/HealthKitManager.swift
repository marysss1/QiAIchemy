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
      dict.merge(values) { _, new in new }
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

    let categoryIdentifiers: [HKCategoryTypeIdentifier] = [
      .sleepAnalysis,
      .appleStandHour,
    ]

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

      var inBed: TimeInterval = 0
      var asleep: TimeInterval = 0
      var awake: TimeInterval = 0

      let categorySamples = (samples ?? []).compactMap { $0 as? HKCategorySample }
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
      }

      completion([
        "inBedMinutesLast36h": Self.round(inBed / 60),
        "asleepMinutesLast36h": Self.round(asleep / 60),
        "awakeMinutesLast36h": Self.round(awake / 60),
        "sampleCountLast36h": categorySamples.count,
      ], nil)
    }

    healthStore.execute(query)
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
    if value == HKCategoryValueSleepAnalysis.asleep.rawValue {
      return true
    }

    if #available(iOS 16.0, *) {
      return value == HKCategoryValueSleepAnalysis.asleepCore.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepREM.rawValue
        || value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
    }

    return false
  }

  private func isSleepAwake(_ value: Int) -> Bool {
    if #available(iOS 16.0, *) {
      return value == HKCategoryValueSleepAnalysis.awake.rawValue
    }
    return false
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
    let factor = pow(10.0, Double(digits))
    return Darwin.round(value * factor) / factor
  }

  private static func isoString(from date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}
