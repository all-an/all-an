/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache license, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the license for the specific language governing permissions and
 * limitations under the license.
 */
package org.apache.log4j;

import org.apache.log4j.spi.LoggingEvent;
import org.apache.logging.log4j.util.Strings;

/**
 *
 */
public class PatternLayout extends Layout {

    /**
     * Default pattern string for log output. Currently set to the string <b>{@value #DEFAULT_CONVERSION_PATTERN}</b> which
     * just prints the application supplied message.
     */
    public final static String DEFAULT_CONVERSION_PATTERN = "%m%n";

    /**
     * A conversion pattern equivalent to the TTCCCLayout. Current value is <b>{@value #TTCC_CONVERSION_PATTERN}</b>
     */
    public final static String TTCC_CONVERSION_PATTERN = "%r [%t] %p %c %x - %m%n";

    /**
     * Constructs a PatternLayout using the DEFAULT_LAYOUT_PATTERN.
     *
     * The default pattern just produces the application supplied message.
     */
    public PatternLayout() {
        this(DEFAULT_CONVERSION_PATTERN);
    }

    public PatternLayout(final String pattern) {

    }

    @Override
    public String format(final LoggingEvent event) {
        return Strings.EMPTY;
    }

    @Override
    public boolean ignoresThrowable() {
        return true;
    }
}
