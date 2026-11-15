// 생성된 파일이다. 직접 고치지 않는다. 원본은 src/lib.rs, 생성은 generate.sh.

/** 규칙 파일의 최상위. */
export interface RuleFile {
  /** 규칙 파일 형식의 버전. */
  formatVersion: number;
  /** 규칙. `id`의 UTF-8 바이트 순서로 정렬한다. */
  rules: Rule[];
  source: RuleSource;
}

export type Category =
  | "ads"
  | "analytics"
  | "payment"
  | "ui"
  | "network"
  | "other";

/** 일치 조건 하나. */
export interface Match {
  /** `target`이 `string-marker`일 때: 표식을 찾을 파일의 경로(리터럴 또는 글롭). 그때만, 그리고 반드시 있다. */
  file?: string;
  /** `target`이 `string-marker`일 때: 이 크기보다 큰 파일에서는 찾지 않는다. 그때만, 그리고 반드시 있다. */
  maxFileBytes?: number;
  /** 이 조건을 적용할 포장 형식. 없으면 전부. */
  packaging?: Packaging[];
  target: MatchTarget;
  type: MatchType;
  /** 맞춰 볼 값. 대소문자를 구별한다. */
  value: string;
}

/** 무엇에 맞춰 보는지. 근거 종류와 확신도가 여기서 정해진다. */
export type MatchTarget =
  /** 파일 이름(경로의 마지막 마디). 예: `libflutter.so`. 확신도 중간. */
  | "file-name"
  /** 앱 뿌리부터의 경로. 구분자는 `/`. 확신도 중간. */
  | "path"
  /** 프레임워크 이름(`.framework`를 뺀 것). 확신도 중간. */
  | "framework-name"
  /** DEX 클래스 이름. `com/example/Foo` 형태. 확신도 중간. */
  | "dex-class"
  /** npm 패키지 이름(`package.json`이 밝힌 이름). 확신도 높음. */
  | "npm-package"
  /** 파일 안의 문자열. `file`과 `maxFileBytes`가 필요하다. 확신도 낮음. */
  | "string-marker";

export type MatchType =
  /** 전체가 같다. */
  | "literal"
  /** 이 값으로 시작한다. `path`와 `dex-class`에서는 값이 `/`로 끝나야 한다. */
  | "prefix"
  /** `*`만 쓰는 글롭. `*`는 `/`를 넘지 않는다. `*`는 두 개까지. */
  | "glob";

export type Packaging =
  | "macos-app"
  | "apk"
  | "ipa";

/** 규칙 한 건. */
export interface Rule {
  category: Category;
  /** 공식 주소. `https:`만. */
  homepage?: string;
  /** 파일 안에서 겹치지 않는 식별자. 소문자, 숫자, `.`, `_`, `-`만 쓴다. */
  id: string;
  kind: RuleKind;
  /** 일치 조건. 하나라도 맞으면 이 규칙이 맞은 것이다. 비어 있으면 안 된다. */
  match: Match[];
  /** 화면에 보일 이름. */
  name: string;
  /** `kind`가 `runtime`일 때 어느 런타임인지. 그때만, 그리고 반드시 있다. */
  runtime?: Runtime;
  /** 만든 곳(회사나 프로젝트). */
  vendor?: string;
}

export type RuleKind =
  | "runtime"
  | "library";

/** 이 파일의 규칙이 어디서 왔는지. 가져온 규칙의 고지 의무를 여기에 적는다. */
export interface RuleSource {
  /** 출처 식별자. 결과 JSON의 `ruleSource`가 된다. 예: `builtin`, `libchecker-rules`, `user`. */
  id: string;
  /** 이 규칙들의 라이선스(SPDX 식별자). 예: `Apache-2.0`. */
  license: string;
  /** 원본을 변환하거나 고쳤으면 true. 가져온 규칙은 항상 true다. */
  modified: boolean;
  /** 사람이 읽는 출처 이름. */
  name: string;
  /** 원본이 요구하는 고지 문구(저작권 표시 등). */
  notice?: string;
  /** 가져온 시점의 원본 판(커밋 해시 등). */
  revision?: string;
  /** 원본의 주소. `https:`만. */
  url?: string;
}

/** 감지할 수 있는 런타임. 감지만 하는 런타임은 표본으로 표식을 확인한 것만 실제로 나온다. */
export type Runtime =
  | "electron"
  | "flutter"
  | "react-native"
  | "cef"
  | "qt"
  | "unity"
  | "dotnet"
  | "tauri"
  | "cordova"
  /** 다른 런타임을 하나도 감지하지 못했을 때의 기본값. */
  | "native"
  /** Android에서는 Jetpack Compose와 구별되지 않는다. */
  | "compose";
