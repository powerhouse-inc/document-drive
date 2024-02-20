# [1.0.0-alpha.2](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2024-02-20)


### Features

* emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
* improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
* proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))

# 1.0.0-alpha.1 (2024-02-16)


### Bug Fixes

* acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
* added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
* apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
* cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
* duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
* handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
* missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
* operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
* prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
* remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
* semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
* transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
* update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))


### Features

* add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
* added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
* added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
* added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
* added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
* added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
* added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
* added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
* added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
* added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
* added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
* added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
* added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
* added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
* added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
* added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
* added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
* added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
* added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
* bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
* bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
* bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
* change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
* defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
* delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
* don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
* emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
* implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
* implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
* improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
* init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
* run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
* sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
* update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
* updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))