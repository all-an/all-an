# syntax=docker/dockerfile:1

# --- build: the Odin toolchain, odin-http, and libpq headers -------------------------------------
FROM debian:bookworm-slim AS build

# The Odin compiler release, and the odin-http commit known to build with it.
ARG ODIN_VERSION=dev-2026-07a
ARG ODIN_HTTP_REF=fac113fbd828aad3d71479a534b5de4358b6a07b
# Appended to asset URLs so a deploy is not hidden behind a cached stylesheet.
ARG ASSET_VERSION=dev
ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git clang llvm libpq-dev \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/odin-lang/Odin/releases/download/${ODIN_VERSION}/odin-linux-${TARGETARCH}-${ODIN_VERSION}.tar.gz" \
      -o /tmp/odin.tar.gz \
 && mkdir /opt/odin \
 && tar -xzf /tmp/odin.tar.gz -C /opt/odin --strip-components=1 \
 && rm /tmp/odin.tar.gz
ENV PATH="/opt/odin:${PATH}"

WORKDIR /src
RUN git clone --quiet https://github.com/laytan/odin-http vendor/odin-http \
 && git -C vendor/odin-http checkout --quiet "${ODIN_HTTP_REF}"

COPY src ./src
COPY static ./static
RUN mkdir -p /out \
 && odin build src -collection:deps=vendor -out:/out/all-an -o:speed -vet -strict-style \
      -define:ASSET_VERSION="${ASSET_VERSION}"

# --- test: `docker build --target test .` runs the unit tests with the same toolchain ---------------
FROM build AS test
RUN odin test src -collection:deps=vendor -vet -strict-style

# --- run: just the binary and libpq ----------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home app

COPY --from=build /out/all-an /usr/local/bin/all-an

USER app
ENV PORT=10000
EXPOSE 10000
CMD ["all-an"]
